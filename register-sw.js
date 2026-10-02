if ('serviceWorker' in navigator && (location.protocol==='http:' || location.protocol==='https:')) {
  window.addEventListener('load', async ()=>{
    try{
      const reg=await navigator.serviceWorker.register('./sw.js?v=1.10');
      await reg.update();
    }catch(e){
      console.error('Service Worker',e);
    }
  });
}
