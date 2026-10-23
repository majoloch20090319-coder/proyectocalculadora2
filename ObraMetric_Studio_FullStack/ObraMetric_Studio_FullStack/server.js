/** ObraMetric Studio: servidor Node.js sin dependencias externas. */
'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=__dirname,DB=path.join(ROOT,'data','database.json'),PORT=Number(process.env.PORT||3000);
fs.mkdirSync(path.dirname(DB),{recursive:true});if(!fs.existsSync(DB))fs.writeFileSync(DB,JSON.stringify({users:[],sessions:[],records:[]},null,2));
const read=()=>JSON.parse(fs.readFileSync(DB,'utf8'));
const write=db=>{const t=DB+'.tmp';fs.writeFileSync(t,JSON.stringify(db,null,2));fs.renameSync(t,DB);};
const id=()=>crypto.randomUUID();const hash=p=>{const salt=crypto.randomBytes(16).toString('hex');return salt+':'+crypto.scryptSync(p,salt,64).toString('hex');};
const verify=(p,s)=>{try{const [salt,stored]=s.split(':');const a=Buffer.from(stored,'hex'),b=crypto.scryptSync(p,salt,a.length);return a.length===b.length&&crypto.timingSafeEqual(a,b);}catch{return false;}};
function response(res,status,obj,cookie){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...(cookie?{'Set-Cookie':cookie}:{})});res.end(JSON.stringify(obj));}
const publicUser=u=>({id:u.id,name:u.name,email:u.email,role:u.role,createdAt:u.createdAt});
function session(req,db){const val=/obrametric_session=([a-f0-9]+)/.exec(req.headers.cookie||'')?.[1];const token=val&&crypto.createHash('sha256').update(val).digest('hex');const s=db.sessions.find(x=>x.hash===token&&x.expires>Date.now());const user=s&&db.users.find(u=>u.id===s.userId);return user||null;}
function startSession(res,db,u){const token=crypto.randomBytes(32).toString('hex');db.sessions.push({hash:crypto.createHash('sha256').update(token).digest('hex'),userId:u.id,expires:Date.now()+30*24*3600*1000});write(db);return `obrametric_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`;}
function calculate(type,v){const r=(label,amount,unit)=>({label,amount,unit});let area,vol;switch(type){
case 'muro':area=v.largo*v.alto;return [r('Superficie',area,'m²'),r('Cemento',area*(v.espesor===30?15.2:10.9),'kg'),r('Arena',area*(v.espesor===30?.115:.09),'m³'),r('Ladrillos',area*(v.espesor===30?120:90),'unidades')];
case 'viga':return [r('Cemento',v.largo*9,'kg'),r('Arena',v.largo*.02,'m³'),r('Piedra',v.largo*.02,'m²'),r('Hierro Ø 8',v.largo*4,'m'),r('Hierro Ø 4',v.largo*3,'m')];
case 'columna':return [r('Cemento',v.largo*7.5,'kg'),r('Arena',v.largo*.016,'m³'),r('Piedra',v.largo*.016,'m²'),r('Hierro Ø 10',v.largo*6,'m'),r('Hierro Ø 4',v.largo*3,'m')];
case 'contrapiso':vol=v.espesor/100*v.ancho*v.largo;return [r('Volumen',vol,'m³'),r('Cemento',vol*105,'kg'),r('Arena',vol*.45,'m³'),r('Piedra',vol*.9,'m³')];
case 'techo':area=v.ancho*v.largo;return [r('Superficie',area,'m²'),r('Cemento',area*33,'kg'),r('Arena',area*.072,'m³'),r('Piedra',area*.072,'m³'),r('Hierro Ø 8',area*7,'m'),r('Hierro Ø 6',area*4,'m')];
case 'pisos':area=v.ancho*v.largo;return [r('Superficie base',area,'m²'),r('Recortes (10 %)',area*.1,'m²'),r('Superficie total',area*1.1,'m²')];
case 'pintura':return [r('Superficie',v.superficie,'m²'),r('Pintura necesaria',v.superficie/6,'L')];
default:throw Error('Tipo de cálculo desconocido');}}
const fields={muro:['espesor','largo','alto'],viga:['largo'],columna:['largo'],contrapiso:['espesor','ancho','largo'],techo:['espesor','ancho','largo'],pisos:['ancho','largo'],pintura:['superficie']};
function normalized(type,input){if(!Object.hasOwn(fields,type)||!input||typeof input!=='object')throw Error('Tipo de cálculo inválido');const values={};for(const f of fields[type]){const x=input[f];if(typeof x!=='number'||!Number.isFinite(x)||x<=0||x>1000000)throw Error('Medidas inválidas: '+f);values[f]=x;}if(type==='muro'&&![20,30].includes(values.espesor))throw Error('Espesor de muro inválido');return values;}
async function body(req){let text='';for await(const chunk of req){text+=chunk;if(text.length>100000)throw Error('Solicitud demasiado grande');}try{return JSON.parse(text||'{}');}catch{throw Error('JSON inválido');}}
const staticFiles={'/':'index.html','/index.html':'index.html','/dashboard.html':'dashboard.html','/auth.js':'auth.js','/app.js':'app.js','/styles.css':'styles.css','/assets/architecture.svg':'assets/architecture.svg'};
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost'),route=url.pathname,method=req.method;try{
if(route.startsWith('/api/')){const db=read(),user=session(req,db);res.setHeader('X-Content-Type-Options','nosniff');
if(route==='/api/register'&&method==='POST'){const b=await body(req),name=String(b.name||'').trim(),email=String(b.email||'').trim().toLowerCase(),p=String(b.password||''),role=b.role;
if(name.length<2||name.length>80||!/^\S+@\S+\.\S+$/.test(email)||p.length<8||p.length>128||!['usuario','admin'].includes(role))return response(res,400,{error:'Verifica el nombre, correo, contraseña y rol.'});
if(db.users.some(x=>x.email===email))return response(res,409,{error:'Ese correo ya está registrado.'});const u={id:id(),name,email,role,passwordHash:hash(p),createdAt:new Date().toISOString()};db.users.push(u);const cookie=startSession(res,db,u);return response(res,201,{user:publicUser(u)},cookie);}
if(route==='/api/login'&&method==='POST'){const b=await body(req),email=String(b.email||'').trim().toLowerCase();const u=db.users.find(x=>x.email===email);if(!u||!verify(String(b.password||''),u.passwordHash))return response(res,401,{error:'Correo o contraseña incorrectos.'});const cookie=startSession(res,db,u);return response(res,200,{user:publicUser(u)},cookie);}
if(route==='/api/logout'&&method==='POST'){const token=/obrametric_session=([a-f0-9]+)/.exec(req.headers.cookie||'')?.[1];if(token){const h=crypto.createHash('sha256').update(token).digest('hex');db.sessions=db.sessions.filter(x=>x.hash!==h);write(db);}return response(res,200,{ok:true},'obrametric_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');}
if(!user)return response(res,401,{error:'Inicia sesión para continuar.'});
if(route==='/api/me'&&method==='GET')return response(res,200,{user:publicUser(user)});
if(route==='/api/admin/users'&&method==='GET'){if(user.role!=='admin')return response(res,403,{error:'Acceso exclusivo de administradores.'});return response(res,200,{users:db.users.map(u=>({...publicUser(u),calculations:db.records.filter(r=>r.userId===u.id).length}))});}
if(route==='/api/calculations'&&method==='GET')return response(res,200,{records:db.records.filter(x=>x.userId===user.id).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(({userId,...r})=>r)});
if((route==='/api/calculations'&&method==='POST')||(route.startsWith('/api/calculations/')&&method==='PUT')){const b=await body(req),v=normalized(b.type,b.inputs),result=calculate(b.type,v),now=new Date().toISOString();let record;if(method==='PUT'){record=db.records.find(r=>r.id===route.split('/').pop()&&r.userId===user.id);if(!record)return response(res,404,{error:'Registro no encontrado.'});Object.assign(record,{type:b.type,inputs:v,result,updatedAt:now});}else{record={id:id(),userId:user.id,type:b.type,inputs:v,result,createdAt:now,updatedAt:now};db.records.push(record);}write(db);return response(res,method==='POST'?201:200,{record});}
if(route.startsWith('/api/calculations/')&&method==='DELETE'){const key=route.split('/').pop(),n=db.records.length;db.records=db.records.filter(r=>r.id!==key||r.userId!==user.id);if(db.records.length===n)return response(res,404,{error:'Registro no encontrado.'});write(db);return response(res,200,{ok:true});}
return response(res,404,{error:'Ruta no encontrada.'});}
const file=staticFiles[route];if(!file){res.writeHead(404);return res.end('No encontrado');}if(route==='/dashboard.html'&&!session(req,read())){res.writeHead(302,{Location:'/index.html'});return res.end();}
res.writeHead(200,{'Content-Type':mime[path.extname(file)],'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});fs.createReadStream(path.join(ROOT,file)).pipe(res);
}catch(e){const code=/inválid|desconocido|grande|Medidas/i.test(e.message)?400:500;response(res,code,{error:code===500?'Error interno del servidor.':e.message});if(code===500)console.error(e);}});
if(require.main===module)server.listen(PORT,()=>console.log(`ObraMetric Studio → http://localhost:${PORT}`));
module.exports={server,calculate,normalized};
