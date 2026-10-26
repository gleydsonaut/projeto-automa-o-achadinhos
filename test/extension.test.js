import test from 'node:test';
import assert from 'node:assert/strict';

test('popup usa a mesma captura/importação nos namespaces Firefox/Safari e Chromium',async()=>{
  const previous={document:globalThis.document,browser:globalThis.browser,chrome:globalThis.chrome,fetch:globalThis.fetch};
  try{
    for(const namespace of ['browser','chrome']){
      const nodes=new Map();
      const node=()=>({value:'',children:[],append(...children){this.children.push(...children);},replaceChildren(){this.children=[];}});
      globalThis.document={querySelector(selector){if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector);},querySelectorAll(selector){return selector.includes(':checked')?[{value:'0'}]:[];},createElement:node,createTextNode:text=>({textContent:text})};
      globalThis.document.querySelector('#server').value='http://127.0.0.1:3138';
      let imported;
      const api={storage:{local:{get:async()=>({token:'local-test-token'}),set:async()=>{}}},tabs:{query:async()=>[{id:1,url:'https://www.amazon.com.br/dp/test'}]},scripting:{executeScript:async()=>[{result:[{title:'Produto',price:10,url:'https://www.amazon.com.br/dp/test'}]}]}};
      delete globalThis.browser;delete globalThis.chrome;globalThis[namespace]=api;
      globalThis.fetch=async(url,options)=>{imported={url,...options};return {ok:true,json:async()=>({count:1})};};
      await import(`../extension/popup.js?namespace=${namespace}`);
      await nodes.get('#scan').onclick();await nodes.get('#send').onclick();
      assert.equal(imported.url,'http://127.0.0.1:3138/api/import/products');assert.equal(JSON.parse(imported.body).items[0].title,'Produto');assert.match(nodes.get('#status').textContent,/1 produto/);
    }
  }finally{for(const [key,value]of Object.entries(previous))if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
});
