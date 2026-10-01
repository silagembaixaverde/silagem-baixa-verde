const fs=require('fs');
fs.mkdirSync('public',{recursive:true});
for(const f of ['style.css','data.js','register-sw.js','sw.js','manifest.webmanifest','logo.svg']) fs.copyFileSync(f,'public/'+f);

if(!process.env.SUPABASE_URL||!process.env.SUPABASE_KEY) throw new Error('Variaveis Supabase ausentes');

let html=fs.readFileSync('index.template.html','utf8');
fs.writeFileSync('public/index.html',html);

let app=fs.readFileSync('app.js','utf8');
app=app.replace('__SUPABASE_URL__',process.env.SUPABASE_URL).replace('__SUPABASE_KEY__',process.env.SUPABASE_KEY);
fs.writeFileSync('public/app.js',app);
