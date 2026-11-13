import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
if(process.platform!=='win32'||process.env.WATERCONSOLE_TEST_HOTWHEELS!=='1')throw new Error('Opt-in: open the original HOT WHEELS game, close other input bridges, then set WATERCONSOLE_TEST_HOTWHEELS=1. Attaches only; does not close the game.');
const helper=path.resolve('build/native/WaterConsole.InputBridge.exe');
const game=path.resolve(process.env.WATERCONSOLE_HOTWHEELS_PATH||'E:/Program Files/Games Program/Epic Games/HOTWHEELSUNLEASHED/hotwheels/Binaries/Win64/EpicGamesStore/hotwheels-Win64-Shipping.exe');
const {pid}=JSON.parse(execFileSync(helper,['--find',game],{encoding:'utf8',windowsHide:true}));assert.ok(Number.isInteger(pid)&&pid>0,'Open the original game first');
const folder=path.resolve('.local/racing-safety');await mkdir(folder,{recursive:true});
const source=path.join(folder,'PadProbe.cs'),probe=path.join(folder,'PadProbe.exe');
await writeFile(source,`using System;using System.Collections.Generic;using System.Runtime.InteropServices;using System.Web.Script.Serialization;class PadProbe{[StructLayout(LayoutKind.Sequential)]struct Pad{public ushort buttons;public byte lt,rt;public short lx,ly,rx,ry;}[StructLayout(LayoutKind.Sequential)]struct State{public uint packet;public Pad pad;}[DllImport("xinput1_4.dll")]static extern uint XInputGetState(uint i,out State state);static void Main(){var pads=new List<object>();for(uint i=0;i<4;i++){State s;if(XInputGetState(i,out s)==0)pads.Add(new{index=i,buttons=s.pad.buttons,lt=s.pad.lt,rt=s.pad.rt,lx=s.pad.lx,ly=s.pad.ly,rx=s.pad.rx});}Console.WriteLine(new JavaScriptSerializer().Serialize(pads));}}`);
execFileSync(path.join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/platform:x64','/reference:System.Web.Extensions.dll','/out:'+probe,source],{windowsHide:true});
const pads=()=>JSON.parse(execFileSync(probe,[],{encoding:'utf8',windowsHide:true}));
const initial=pads();assert.equal(initial.length,0,'Disconnect other XInput devices/input bridges before this isolated test.');
const bridge=spawn(helper,['--pid',String(pid)],{stdio:['pipe','pipe','pipe'],windowsHide:true});
const events=[],checks=[],observations={initial};let buffer='',timer,exited=false;bridge.once('exit',()=>exited=true);
bridge.stdout.on('data',data=>{buffer+=data;let end;while((end=buffer.indexOf('\n'))>=0){try{events.push(JSON.parse(buffer.slice(0,end)));}catch{}buffer=buffer.slice(end+1);}});
const send=value=>bridge.stdin.write(JSON.stringify(value)+'\n');
async function until(predicate,message,timeout=6000){const end=Date.now()+timeout;while(Date.now()<end){if(predicate())return;await delay(40);}throw new Error(message);}
const neutral=state=>state.length===2&&state.every(p=>!p.buttons&&!p.lt&&!p.rt&&!p.lx&&!p.ly&&!p.rx);
const show=mode=>execFileSync('powershell.exe',['-NoProfile','-Command',`Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class RacingWindow{[DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h,int c);}'; $gameWindow=Get-Process -Id ${pid}; [RacingWindow]::ShowWindow($gameWindow.MainWindowHandle,${mode}) | Out-Null`],{windowsHide:true});
const epoch=Date.now();let frame={type:'input',epoch,controls:'race',players:[{slot:1,buttons:['a','right','x']},{slot:2,buttons:['b','left']}]};
try{
 await until(()=>events.some(e=>e.type==='ready'),'No bridge ready event');assert.ok(events.find(e=>e.type==='ready').gamepad?.available,'Install the separately approved optional driver first');
 send({type:'focus'});await until(()=>events.some(e=>e.type==='status'&&e.focused),'Game could not receive focus');
 timer=setInterval(()=>send(frame),60);send(frame);
 await until(()=>{const p=pads();const held=p.length===2&&p[0].rt===255&&p[0].lx===32767&&p[1].lt===255&&p[1].lx===-32767;if(held)observations.held=p;return held;},'Two independent pad states missing');checks.push('Two separate XInput devices accept independent pedals, steering and boost.');
 frame={...frame,players:[{slot:1,buttons:[]},{slot:2,buttons:['b','left']}]};send(frame);await until(()=>{const p=pads();return p.length===2&&!p[0].rt&&!p[0].lx&&p[1].lt===255&&p[1].lx===-32767;},'P1 release disturbed P2');checks.push('Releasing P1 preserves P2 held input.');
 frame={...frame,players:[{slot:1,buttons:['a']},{slot:2,buttons:['a']}]};send(frame);await until(()=>pads().filter(p=>p.rt===255).length===2,'Throttle hold missing');const mark=events.length;show(6);await delay(600);observations.minimized=pads();assert.ok(neutral(observations.minimized),'Minimized game retained input');assert.ok(events.slice(mark).some(e=>e.type==='status'&&e.focused===false),'Minimized game still reported focused');checks.push('Minimizing the foreground game releases both pads while heartbeats continue and reports focus loss.');
 show(9);send({type:'focus'});await until(()=>events.slice(mark).some(e=>e.type==='status'&&e.focused===true),'Focus did not recover');send(frame);await until(()=>pads().filter(p=>p.rt===255).length===2,'Fresh input did not recover');checks.push('Restoring focus accepts a fresh snapshot.');
 clearInterval(timer);timer=undefined;send({...frame,epoch:epoch-1});await delay(80);assert.ok(neutral(pads()),'Old epoch retained input');checks.push('Stale epoch resets both devices.');
 send(frame);await until(()=>pads().filter(p=>p.rt===255).length===2,'Watchdog precondition missing');await delay(420);assert.ok(neutral(pads()),'300ms watchdog failed');checks.push('Missing snapshots trigger the 300ms neutral watchdog.');
 send(frame);await until(()=>pads().filter(p=>p.rt===255).length===2,'Malformed precondition missing');bridge.stdin.write('null\n');await delay(80);assert.ok(neutral(pads()),'Malformed message retained input');checks.push('Malformed input immediately resets both devices.');
 timer=setInterval(()=>send(frame),60);send(frame);await until(()=>pads().filter(p=>p.rt===255).length===2,'EOF precondition missing');clearInterval(timer);timer=undefined;bridge.stdin.end();await until(()=>exited,'Bridge did not exit after EOF');await until(()=>pads().length===0,'Virtual pads survived bridge exit');observations.afterEOF=pads();checks.push('EOF neutralizes and removes both devices without closing the attached original game.');
 const report={passed:true,at:new Date().toISOString(),checks,observations,limits:'Original-game process and actual XInput state tested on this PC; not physical phone vibration or a full race completion.'};await writeFile(path.join(folder,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{clearInterval(timer);if(bridge.stdin.writable){send({type:'shutdown'});bridge.stdin.end();}show(9);}
