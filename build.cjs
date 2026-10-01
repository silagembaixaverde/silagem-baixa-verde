const fs=require('fs');
fs.mkdirSync('public',{recursive:true});
for(const f of ['style.css','data.js','app.js','register-sw.js','sw.js','manifest.webmanifest','logo.svg']) fs.copyFileSync(f,'public/'+f);
let html=fs.readFileSync('index.template.html','utf8');
if(!process.env.SUPABASE_URL||!process.env.SUPABASE_KEY) throw new Error('Variaveis Supabase ausentes');
html=html.replace('__SUPABASE_URL__',process.env.SUPABASE_URL).replace('__SUPABASE_KEY__',process.env.SUPABASE_KEY);
fs.writeFileSync('public/index.html',html);
