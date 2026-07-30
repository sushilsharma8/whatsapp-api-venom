#!/usr/bin/env node
/**
 * Venom-bot 5.x lags WhatsApp Web internals.
 * Re-apply small patches after npm install.
 */
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..', 'node_modules', 'venom-bot', 'dist')

function patchAuthQr() {
  const target = path.join(root, 'controllers', 'auth.js')
  if (!fs.existsSync(target)) return

  let text = fs.readFileSync(target, 'utf8')
  if (text.includes('Modern WhatsApp Web often drops .landing-wrapper')) {
    console.log('venom QR patch already applied')
    return
  }

  const old = `        const elLoginWrapper1 = document.querySelector('body > div > div > .landing-wrapper');
        const elLoginWrapper2 = document.querySelector('body > div > div > div > .landing-wrapper');
        const elLoginWrapper3 = document.querySelector('body > div > div > div > div > div > .x1lliihq');
        const elQRCodeCanvas = document.querySelector('canvas');
        if ((elLoginWrapper1 && elQRCodeCanvas) ||
            (elLoginWrapper2 && elQRCodeCanvas) ||
            (elLoginWrapper3 && elQRCodeCanvas)) {
            return 'UNPAIRED';
        }`

  const replacement = `        const elLoginWrapper1 = document.querySelector('body > div > div > .landing-wrapper');
        const elLoginWrapper2 = document.querySelector('body > div > div > div > .landing-wrapper');
        const elLoginWrapper3 = document.querySelector('body > div > div > div > div > div > .x1lliihq');
        const elQRCodeCanvas = document.querySelector('canvas');
        const elDataRef = document.querySelector('[data-ref]');
        const streamMode = window?.Store?.Stream?.mode;
        // Modern WhatsApp Web often drops .landing-wrapper; treat QR canvas as unpaired
        if ((elLoginWrapper1 && elQRCodeCanvas) ||
            (elLoginWrapper2 && elQRCodeCanvas) ||
            (elLoginWrapper3 && elQRCodeCanvas) ||
            (elDataRef && elQRCodeCanvas) ||
            (elQRCodeCanvas && streamMode === 'QR') ||
            (elQRCodeCanvas && !document.querySelector('#app .two, .app .two, [data-testid="chat-list"]'))) {
            return 'UNPAIRED';
        }`

  if (!text.includes(old)) {
    console.warn('venom QR patch: expected selectors not found — skip')
    return
  }

  fs.writeFileSync(target, text.replace(old, replacement))
  console.log('venom QR patch applied')
}

function patchMaybeMeUser() {
  const target = path.join(root, 'lib', 'wapi', 'wapi.js')
  if (!fs.existsSync(target)) return

  let text = fs.readFileSync(target, 'utf8')
  if (text.includes('getMaybeMePnUser')) {
    console.log('venom MaybeMeUser patch already applied')
    return
  }

  // WhatsApp renamed getMaybeMeUser → getMaybeMePnUser / getMaybeMeLidUser.
  // Find the module under either name and polyfill the old method.
  const poly =
    '(e.getMaybeMeUser||e.getMaybeMePnUser||e.getMaybeMeLidUser)?(e.getMaybeMeUser||(e.getMaybeMeUser=function(){return(e.getMaybeMePnUser&&e.getMaybeMePnUser())||(e.getMaybeMeLidUser&&e.getMaybeMeLidUser())}),e):null'

  const replacements = [
    [
      '{id:"MaybeMeUser",conditions:e=>e.getMaybeMeUser?e:null}',
      `{id:"MaybeMeUser",conditions:e=>${poly}}`,
    ],
    [
      '{type:"MaybeMeUser",when:e=>e.getMaybeMeUser?e:null}',
      `{type:"MaybeMeUser",when:e=>${poly}}`,
    ],
  ]

  let changed = 0
  for (const [from, to] of replacements) {
    if (!text.includes(from)) {
      console.warn(`venom MaybeMeUser patch: missing ${from.slice(0, 40)}… — skip`)
      continue
    }
    text = text.replace(from, to)
    changed++
  }

  if (!changed) return

  fs.writeFileSync(target, text)
  console.log('venom MaybeMeUser patch applied')
}

function patchSendSeen() {
  const target = path.join(root, 'lib', 'wapi', 'wapi.js')
  if (!fs.existsSync(target)) return

  let text = fs.readFileSync(target, 'utf8')
  if (text.includes('venomSendSeenSafe')) {
    console.log('venom sendSeen patch already applied')
    return
  }

  // New WA Web wants sendSeen({chat, threadId}); old venom still calls sendSeen(chat, false).
  const safe =
    '(async function venomSendSeenSafe(c){try{await window.Store.ReadSeen.sendSeen({chat:c,threadId:void 0})}catch(e){try{await window.Store.ReadSeen.sendSeen(c,!1)}catch(_){}}})'

  const pairs = [
    [
      'n&&await window.Store.ReadSeen.sendSeen(r,!1)',
      `n&&await ${safe}(r)`,
    ],
    [
      'n&&await window.Store.ReadSeen.sendSeen(a,!1)',
      `n&&await ${safe}(a)`,
    ],
    [
      'await Store.ReadSeen.sendSeen(t,!1)',
      `await ${safe}(t)`,
    ],
    // getHost → sendExist(me) was crashing on sendSeen; skip seen for host lookup
    [
      'window.WAPI.getHost=async function(){const e=await Store.MaybeMeUser.getMaybeMeUser();if(e){const t=await WAPI.sendExist(e._serialized);',
      'window.WAPI.getHost=async function(){const e=await Store.MaybeMeUser.getMaybeMeUser();if(e){const t=await WAPI.sendExist(e._serialized,!0,!1);',
    ],
  ]

  let changed = 0
  for (const [from, to] of pairs) {
    if (!text.includes(from)) {
      console.warn(`venom sendSeen patch: missing ${from.slice(0, 48)}… — skip`)
      continue
    }
    text = text.replace(from, to)
    changed++
  }

  if (!changed) return
  fs.writeFileSync(target, text)
  console.log(`venom sendSeen patch applied (${changed} sites)`)
}

function patchGetNewMessageId() {
  const target = path.join(root, 'lib', 'wapi', 'wapi.js')
  if (!fs.existsSync(target)) return

  let text = fs.readFileSync(target, 'utf8')
  if (text.includes('venomGetChatForMsgKey')) {
    console.log('venom getNewMessageId patch already applied')
    return
  }

  const old =
    'getNewMessageId=async function(e,t=!0){const n=t?await WAPI.sendExist(e):await WAPI.returnChat(e);if(n.id){const e=new Object;return e.fromMe=!0,e.id=await WAPI.getNewId().toUpperCase(),e.remote=new Store.WidFactory.createWid(n.id._serialized),e._serialized=`${e.fromMe}_${e.remote}_${e.id}`,new Store.MsgKey(e)}return!1}'

  // LID chats often fail checkNumberStatus; resolve via Store.Chat and build MsgKey from Wid.
  const neu =
    'getNewMessageId=async function(e,t=!0){const venomGetChatForMsgKey=async e=>{let n=t?await WAPI.sendExist(e,!0,!1):await WAPI.returnChat(e,!0,!1);if(n&&n.id)return n;try{const i=Store.WidFactory.createWid(e);n=Store.Chat.get(i)||await Store.Chat.find(i)}catch(e){}return n&&n.id?n:null};const n=await venomGetChatForMsgKey(e);if(n&&n.id){const e={fromMe:!0,id:(Store.MsgKey&&Store.MsgKey.newId?await Store.MsgKey.newId():(await WAPI.getNewId()).toUpperCase()),remote:n.id};e._serialized=`${e.fromMe}_${e.remote}_${e.id}`;const i=Store.MsgKey||(window.require&&window.require("WAWebMsgKey"));return i?new i(e):!1}return!1}'

  if (!text.includes(old)) {
    console.warn('venom getNewMessageId patch: expected function not found — skip')
    return
  }

  fs.writeFileSync(target, text.replace(old, neu))
  console.log('venom getNewMessageId patch applied')
}

function patchLidSend() {
  const target = path.join(root, 'lib', 'wapi', 'wapi.js')
  if (!fs.existsSync(target)) return

  let text = fs.readFileSync(target, 'utf8')
  let changed = 0

  if (!text.includes('id.server==="lid"||id.isLid&&id.isLid()')) {
    const fromOld =
      'getNewMessageId(s.id._serialized,a),l=await Store.MaybeMeUser.getMaybeMeUser();let u=await WAPI.getchatId(s.id)'
    const fromNew =
      'getNewMessageId(s.id._serialized,a),l=await(async()=>{const m=Store.MaybeMeUser,id=s.id,lid=id&&(id.server==="lid"||id.isLid&&id.isLid()||String(id._serialized||id).includes("@lid"));return lid&&m.getMaybeMeLidUser?m.getMaybeMeLidUser():m.getMaybeMePnUser?m.getMaybeMePnUser():m.getMaybeMeUser()})();let u=await WAPI.getchatId(s.id)'
    if (text.includes(fromOld)) {
      text = text.replace(fromOld, fromNew)
      changed++
    } else {
      console.warn('venom LID from patch: target not found — skip')
    }
  } else {
    console.log('venom LID from patch already applied')
  }

  if (!text.includes('WAWebFindChatAction')) {
    const addOld =
      'await Store.Chat.add({createdLocally:!0,id:t},{merge:!0}),r=await Store.Chat.find(s)'
    const addNew =
      'await(async()=>{try{const f=window.require&&window.require("WAWebFindChatAction");if(f&&f.findOrCreateLatestChat){const x=await f.findOrCreateLatestChat(t);if(x&&x.chat){r=x.chat;return}}}catch(e){}await Store.Chat.add({createdLocally:!0,id:t},{merge:!0}),r=await Store.Chat.find(s)})()'
    if (text.includes(addOld)) {
      text = text.replace(addOld, addNew)
      changed++
    } else {
      console.warn('venom findOrCreate patch: target not found — skip')
    }
  } else {
    console.log('venom findOrCreate patch already applied')
  }

  if (!changed) return
  fs.writeFileSync(target, text)
  console.log(`venom LID send patches applied (${changed})`)
}

patchAuthQr()
patchMaybeMeUser()
patchSendSeen()
patchGetNewMessageId()
patchLidSend()
