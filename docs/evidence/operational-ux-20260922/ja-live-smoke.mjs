import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const require=createRequire('/home/kripta/ja-automation-platform-vps-hotfix/package.json');
const {chromium}=require('playwright');
const dir='/home/kripta/ja-automation-platform-vps-hotfix/docs/evidence/operational-ux-20260922/production';
await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true});
const checks=[];
try {
 for(const width of [390,1440]) for(const locale of ['en','es','pt']) for(const kind of ['site','login']){
  const context=await browser.newContext({viewport:{width,height:900}});
  const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400) errors.push(`${r.status()} ${r.url()}`);});
  const url=`https://j-aautomation.com/j-aautomation/${kind==='site'?locale:`app/login?lang=${locale}`}`;
  const response=await page.goto(url,{waitUntil:'networkidle'});
  await page.evaluate(()=>document.fonts.ready);
  const dom=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,font:document.fonts.check('16px Geist'),lang:document.documentElement.lang,heading:document.querySelector('h1')?.textContent}));
  checks.push({url,width,status:response.status(),...dom,errors});
  if(response.status()!==200||dom.overflow||!dom.font||errors.length)throw new Error(JSON.stringify(checks.at(-1)));
  if(kind==='login'&&locale==='es')await page.screenshot({path:`${dir}/login-es-${width}.png`});
  await context.close();
 }
 await writeFile(`${dir}/browser.json`,JSON.stringify({at:new Date().toISOString(),checks},null,2));
 console.log(JSON.stringify({passed:checks.length}));
}finally{await browser.close();}
