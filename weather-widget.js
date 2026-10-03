(function(){
  const weatherText={
    0:'Céu limpo',1:'Quase limpo',2:'Parcialmente nublado',3:'Nublado',
    45:'Neblina',48:'Neblina',51:'Garoa fraca',53:'Garoa',55:'Garoa forte',
    61:'Chuva fraca',63:'Chuva',65:'Chuva forte',71:'Neve fraca',73:'Neve',75:'Neve forte',
    80:'Pancadas fracas',81:'Pancadas',82:'Pancadas fortes',95:'Trovoadas',96:'Trovoadas',99:'Trovoadas'
  };

  function getWidget(){
    return {
      clock:document.getElementById('liveClock'),
      date:document.getElementById('liveDate'),
      place:document.getElementById('livePlace'),
      temp:document.getElementById('liveTemp'),
      condition:document.getElementById('liveCondition')
    };
  }

  function tick(){
    const el=getWidget();
    if(!el.clock)return;
    const now=new Date();
    el.clock.textContent=now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    el.date.textContent=now.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'});
  }

  function fallbackLocation(){
    try{
      const db=JSON.parse(localStorage.getItem('sbv-db')||'null');
      const city=(db&&db.settings&&db.settings.city)||'Bebedouro';
      const state=(db&&db.settings&&db.settings.state)||'SP';
      return {city:String(city||'Bebedouro').trim(),state:String(state||'SP').trim()};
    }catch(e){
      return {city:'Bebedouro',state:'SP'};
    }
  }

  async function weatherByCoords(lat,lon,placeLabel){
    const el=getWidget();
    const url='https://api.open-meteo.com/v1/forecast?latitude='+encodeURIComponent(lat)+'&longitude='+encodeURIComponent(lon)+'&current=temperature_2m,weather_code&timezone=auto';
    const r=await fetch(url,{cache:'no-store'});
    if(!r.ok)throw new Error('weather');
    const data=await r.json();
    if(el.place)el.place.textContent=placeLabel||'Local atual';
    if(el.temp)el.temp.textContent=Math.round(Number(data.current&&data.current.temperature_2m||0))+'°C';
    if(el.condition)el.condition.textContent=weatherText[data.current&&data.current.weather_code]||'Clima atual';
  }

  async function reversePlace(lat,lon){
    try{
      const r=await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude='+encodeURIComponent(lat)+'&longitude='+encodeURIComponent(lon)+'&localityLanguage=pt',{cache:'no-store'});
      if(!r.ok)throw new Error('reverse');
      const d=await r.json();
      const city=d.city||d.locality||d.principalSubdivision||'Local atual';
      const state=d.principalSubdivisionCode?String(d.principalSubdivisionCode).split('-').pop():(d.principalSubdivision||'');
      return [city,state].filter(Boolean).join(' - ');
    }catch(e){
      return 'Local atual';
    }
  }

  async function weatherByCity(){
    const loc=fallbackLocation();
    const el=getWidget();
    if(el.place)el.place.textContent=[loc.city,loc.state].filter(Boolean).join(' - ');
    try{
      const q=encodeURIComponent(loc.city);
      const geo=await fetch('https://geocoding-api.open-meteo.com/v1/search?name='+q+'&count=1&language=pt&format=json&countryCode=BR',{cache:'no-store'});
      if(!geo.ok)throw new Error('geo');
      const gd=await geo.json();
      const hit=gd.results&&gd.results[0];
      if(!hit)throw new Error('geo-empty');
      const label=[hit.name,hit.admin1].filter(Boolean).join(' - ');
      await weatherByCoords(hit.latitude,hit.longitude,label);
    }catch(e){
      if(el.temp)el.temp.textContent='--°C';
      if(el.condition)el.condition.textContent='Clima indisponível';
    }
  }

  function refreshWeather(){
    if(navigator.geolocation){
      navigator.geolocation.getCurrentPosition(async function(pos){
        try{
          const lat=pos.coords.latitude,lon=pos.coords.longitude;
          const label=await reversePlace(lat,lon);
          await weatherByCoords(lat,lon,label);
        }catch(e){
          weatherByCity();
        }
      },function(){
        weatherByCity();
      },{enableHighAccuracy:false,timeout:6000,maximumAge:30*60*1000});
    }else{
      weatherByCity();
    }
  }

  function init(){
    tick();
    setInterval(tick,1000);
    refreshWeather();
    setInterval(refreshWeather,30*60*1000);
    window.addEventListener('storage',function(e){
      if(e.key==='sbv-db')refreshWeather();
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
  else init();
})();