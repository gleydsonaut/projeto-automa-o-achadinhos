let observer,controller;
export function bindDialogs(root) {
  document.body.classList.remove('has-dialog');
  observer?.disconnect();controller?.abort();controller=new AbortController();
  let opener=null,visible=false;
  function update(){const dialog=root.querySelector('[role="dialog"]');if(dialog){if(!visible)opener=document.activeElement;visible=true;document.body.classList.add('has-dialog');dialog.querySelector('input:not([disabled]),select,textarea,button')?.focus();}else if(visible){visible=false;document.body.classList.remove('has-dialog');if(opener?.isConnected)opener.focus();else document.querySelector('#main-content')?.focus();}}
  observer=new MutationObserver(update);observer.observe(root,{childList:true});
  document.addEventListener('keydown',event=>{const dialog=root.querySelector('[role="dialog"]');if(!dialog)return;if(event.key==='Escape'){event.preventDefault();dialog.querySelector('#close-modal')?.click();}if(event.key==='Tab'){const items=[...dialog.querySelectorAll('button,a[href],input,select,textarea,[tabindex="0"]')].filter(node=>!node.disabled&&node.getClientRects().length),first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}},{signal:controller.signal});
}
