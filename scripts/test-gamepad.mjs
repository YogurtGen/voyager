import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile, copyFile, readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

if (process.platform !== "win32")
  throw new Error("The native gamepad check requires Windows.");
const pureOnly = process.argv.includes("--pure");
const output = path.resolve(
  pureOnly
    ? ".local/native-gamepad-pure/probe"
    : ".local/hotwheels-split-input/probe",
);
await mkdir(output, { recursive: true });
const compiler = path.join(
  process.env.WINDIR || "C:/Windows",
  "Microsoft.NET/Framework64/v4.0.30319/csc.exe",
);
const run = (file, args) =>
  execFileSync(file, args, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 15_000,
  });
const source = path.join(output, "GamepadMappingProbe.cs");
await writeFile(
  source,
  String.raw`using System;using System.Collections.Generic;using System.Reflection;using System.Runtime.Serialization;using System.IO;using System.Web.Script.Serialization;class GamepadMappingProbe {
static int checks;static void Check(bool value,string message){checks++;if(!value)throw new Exception(message);}
static VirtualRacingGamepad.Report Map(string mode,params string[] actions){return VirtualRacingGamepad.Map(actions,mode);}
static VirtualRacingGamepad.Report Disney(params string[] actions){return VirtualRacingGamepad.Map(actions,"race","disney-speedstorm");}
static VirtualRacingGamepad.Report Brawl(string mode,params string[] actions){return VirtualRacingGamepad.Map(actions,mode,"brawlhalla");}
static bool Neutral(VirtualRacingGamepad.Report report){return report.buttons==0&&report.leftTrigger==0&&report.rightTrigger==0&&report.leftX==0&&report.leftY==0&&report.rightX==0&&report.rightY==0;}
static void Main(){
var menu=Map("menu","left","up","confirm","back","l","r");Check(menu.buttons==0x3305,"Menu dpad/A/B/LB/RB mismatch");Check(menu.leftTrigger==0&&menu.rightTrigger==0&&menu.leftX==0,"Menu unexpectedly drives");
var race=Map("race","a","b","right","x");Check(race.rightTrigger==255&&race.leftTrigger==255&&race.leftX==32767&&race.buttons==0x1000,"Independent pedals/steering/boost mismatch");
var pitch=Map("race","up");Check(pitch.leftY==32767,"Pitch forward must use left stick up");
var opposite=Map("race","left","right","up","down");Check(opposite.leftX==0&&opposite.leftY==0,"Opposed directions must cancel");
var release=Map("race");Check(release.buttons==0&&release.leftX==0&&release.leftY==0&&release.leftTrigger==0&&release.rightTrigger==0,"Empty snapshot must be neutral");
var changed=Map("menu","a");Check(changed.buttons==0x1000&&changed.rightTrigger==0,"Mode switch retained throttle");
var utilities=Map("race","start","select","l","r","y");Check(utilities.buttons==0x8110&&utilities.rightX==0,"Utility mapping mismatch");
var rollLeft=Map("race","l");var rollRight=Map("race","r");Check(rollLeft.rightX==-32767&&rollRight.rightX==32767&&rollLeft.buttons==0&&rollRight.buttons==0,"Roll must use right stick without LB/RB boost");
var lookBack=Map("race","select");Check(lookBack.buttons==0x0100,"Look back must use LB");
Check(System.Runtime.InteropServices.Marshal.SizeOf(typeof(VirtualRacingGamepad.Report))==12,"XUSB report ABI size mismatch");
var instance=BindingFlags.Instance|BindingFlags.NonPublic;var statics=BindingFlags.Static|BindingFlags.NonPublic;
typeof(InputBridge).GetMethod("SetGameIdentity",statics).Invoke(null,new object[]{"hotwheels-Win64-Shipping.exe"});var keyboardMapping=typeof(InputBridge).GetMethod("Mapping",statics);var keyboardMenu=(Dictionary<string,int>)keyboardMapping.Invoke(null,new object[]{1,"menu"});var keyboardRace=(Dictionary<string,int>)keyboardMapping.Invoke(null,new object[]{1,"race"});Check(keyboardMenu["start"]==0x20,"Keyboard fallback Ready must use Space");Check(keyboardRace["start"]==0x1b,"Keyboard fallback Pause must use Escape");
var p1=(VirtualRacingGamepad)FormatterServices.GetUninitializedObject(typeof(VirtualRacingGamepad));var p2=(VirtualRacingGamepad)FormatterServices.GetUninitializedObject(typeof(VirtualRacingGamepad));
var accept=typeof(VirtualRacingGamepad).GetField("acceptFeedback",instance);accept.SetValue(p1,true);accept.SetValue(p2,true);
var receive=typeof(VirtualRacingGamepad).GetMethod("ReceiveMotors",instance);receive.Invoke(p1,new object[]{IntPtr.Zero,IntPtr.Zero,(byte)199,(byte)17,(byte)0,IntPtr.Zero});receive.Invoke(p2,new object[]{IntPtr.Zero,IntPtr.Zero,(byte)23,(byte)64,(byte)0,IntPtr.Zero});
Check(p1.ReadMotors()==(199|(17<<8))&&p2.ReadMotors()==(23|(64<<8)),"Player motor callbacks must remain independent");
p1.Reset();Check(p1.ReadMotors()==0&&p2.ReadMotors()==(23|(64<<8)),"Resetting P1 must not reset P2 callback state");
accept.SetValue(p1,false);receive.Invoke(p1,new object[]{IntPtr.Zero,IntPtr.Zero,(byte)255,(byte)255,(byte)0,IntPtr.Zero});Check(p1.ReadMotors()==0,"Disabled callback must ignore late feedback");
accept.SetValue(p1,true);receive.Invoke(p1,new object[]{IntPtr.Zero,IntPtr.Zero,(byte)199,(byte)17,(byte)0,IntPtr.Zero});
var available=typeof(VirtualRacingGamepad).GetField("<Available>k__BackingField",instance);available.SetValue(p1,true);available.SetValue(p2,true);var target=typeof(VirtualRacingGamepad).GetField("target",instance);target.SetValue(p1,new IntPtr(1));target.SetValue(p2,new IntPtr(2));
typeof(InputBridge).GetField("Gamepads",statics).SetValue(null,new VirtualRacingGamepad[]{p1,p2});typeof(InputBridge).GetMethod("SetGameIdentity",statics).Invoke(null,new object[]{"hotwheels-Win64-Shipping.exe"});typeof(InputBridge).GetField("epoch",statics).SetValue(null,(long)52);
var forward=typeof(InputBridge).GetMethod("ForwardRumble",statics);var saved=Console.Out;var capture=new StringWriter();Console.SetOut(capture);try{forward.Invoke(null,new object[]{true});forward.Invoke(null,new object[]{false});}finally{Console.SetOut(saved);}
var lines=capture.ToString().Split(new[]{'\r','\n'},StringSplitOptions.RemoveEmptyEntries);Check(lines.Length==4,"Active callbacks and immediate stop must emit one independent event per player");var json=new JavaScriptSerializer();var first=json.Deserialize<Dictionary<string,object>>(lines[0]);var second=json.Deserialize<Dictionary<string,object>>(lines[1]);var stop=json.Deserialize<Dictionary<string,object>>(lines[2]);Check((int)first["slot"]==1&&(int)first["largeMotor"]==199&&(int)second["slot"]==2&&(int)second["largeMotor"]==23&&(int)first["epoch"]==52,"Rumble must retain slot identity, epoch, and actual motor bytes");Check((int)stop["largeMotor"]==0&&(int)stop["smallMotor"]==0,"Rumble stop must emit zero without waiting for cadence");
var identity=typeof(InputBridge).GetMethod("SetGameIdentity",statics);identity.Invoke(null,new object[]{"Disney_Speedstorm_x64_rtl.exe"});Check((int)typeof(InputBridge).GetProperty("PlayerLimit",statics).GetValue(null,null)==4,"Disney must expose four independently mapped native slots");
var disneyMenu=VirtualRacingGamepad.Map(new[]{"left","confirm","start"},"menu","disney-speedstorm");Check(disneyMenu.buttons==0x1010&&disneyMenu.leftX==-32767&&disneyMenu.leftY==0&&disneyMenu.rightTrigger==0,"Disney menu must use fixed gamepad controls");
var disneyThrottle=Disney("a");Check(disneyThrottle.rightTrigger==255&&disneyThrottle.buttons==0&&disneyThrottle.leftTrigger==0,"Disney throttle must use RT without boost or brake");
var disneyBrake=Disney("b");Check(disneyBrake.buttons==0x2000&&disneyBrake.leftTrigger==0&&disneyBrake.rightTrigger==0,"Disney brake must use B, independently from drift");
Check(Disney("x").buttons==0x1000,"Disney boost must use A");Check(Disney("y").buttons==0x4000,"Disney hop/stunt must use X");
var disneyRear=Disney("rt");Check(disneyRear.rightY==-32767&&disneyRear.buttons==0&&disneyRear.rightTrigger==0,"Disney rear view must use held right-stick down without firing a skill or throttle");
var disneyDrift=Disney("lt");Check(disneyDrift.leftTrigger==255&&disneyDrift.buttons==0,"Disney drift must use LT without braking");
Check(Disney("select").buttons==0x0040,"Disney Super Kart skill must press left thumb");Check(Disney("start").buttons==0x0010,"Disney pause must use Start");
var disneySteer=Disney("left");Check(disneySteer.leftX==-32767&&disneySteer.leftY==0&&disneySteer.rightX==0,"Disney steering must use left stick X");Check(Disney("right").leftX==32767,"Disney right steering polarity mismatch");
var disneySkill=Disney("up");var disneyCharge=Disney("down");Check(disneySkill.buttons==0x8000&&disneySkill.rightY==0&&disneyCharge.buttons==0x8000&&disneyCharge.rightY==0&&disneySkill.leftY==0&&disneyCharge.leftY==0,"Disney tap skill and held charge must share Y without hop or rear view");
Check(Disney("up","down").buttons==0x8000&&Disney("up","down").rightY==0,"Holding both skill touch targets must keep one Y input active");
var skillAndRear=Disney("up","rt","y");Check(skillAndRear.buttons==0xC000&&skillAndRear.rightY==-32767,"Disney skill, rear view and Hop must remain independent in a held combination");
Check(Disney("l").rightX==-32767&&Disney("r").rightX==32767&&Disney("l").buttons==0&&Disney("r").buttons==0,"Disney dash must use right stick X without shoulder buttons");
Check(Neutral(Disney("left","right","l","r")),"Opposed Disney steering and dash directions must cancel");
var disneyCombo=Disney("a","left","lt","x","up","r");Check(disneyCombo.rightTrigger==255&&disneyCombo.leftTrigger==255&&disneyCombo.leftX==-32767&&disneyCombo.rightX==32767&&disneyCombo.rightY==0&&disneyCombo.leftY==0&&disneyCombo.buttons==0x9000,"Disney throttle/steer/drift/boost/charged skill/dash must coexist");
Check(Disney("confirm","back").buttons==0x3000,"Disney confirm/back must alias A/B");Check(Disney("x","confirm","b","back").buttons==0x3000,"Disney semantic aliases must not duplicate or alter buttons");
Check(Neutral(Disney()),"Disney empty Race snapshot must release every axis, trigger and button");
var disneyMenuAfterRace=VirtualRacingGamepad.Map(new[]{"up","a","lt","rt","l","r","select"},"menu","disney-speedstorm");Check(disneyMenuAfterRace.leftY==32767&&disneyMenuAfterRace.rightY==0&&disneyMenuAfterRace.rightX==0&&disneyMenuAfterRace.buttons==0x1320&&disneyMenuAfterRace.leftTrigger==255&&disneyMenuAfterRace.rightTrigger==255,"Disney Menu bindings must remain separate from Race");
bool rejectedProfile=false;try{VirtualRacingGamepad.Map(new[]{"a"},"race","unknown-game");}catch(InvalidOperationException){rejectedProfile=true;}Check(rejectedProfile,"Unknown gamepad profile must be rejected");
bool rejectedMode=false;try{VirtualRacingGamepad.Map(new[]{"a"},"fight","disney-speedstorm");}catch(InvalidOperationException){rejectedMode=true;}Check(rejectedMode,"Disney must reject an unknown control mode");
var wantedField=typeof(VirtualRacingGamepad).GetField("wanted",instance);var independentPads=new VirtualRacingGamepad[4];var independentActions=new[]{new[]{"a","right"},new[]{"b","left"},new[]{"up","l","lt"},new[]{"down","r","select","rt"}};for(int index=0;index<4;index++){independentPads[index]=(VirtualRacingGamepad)FormatterServices.GetUninitializedObject(typeof(VirtualRacingGamepad));independentPads[index].Want(independentActions[index],"race","disney-speedstorm");}
var wanted1=(VirtualRacingGamepad.Report)wantedField.GetValue(independentPads[0]);var wanted2=(VirtualRacingGamepad.Report)wantedField.GetValue(independentPads[1]);var wanted3=(VirtualRacingGamepad.Report)wantedField.GetValue(independentPads[2]);var wanted4=(VirtualRacingGamepad.Report)wantedField.GetValue(independentPads[3]);
Check(wanted1.rightTrigger==255&&wanted1.leftX==32767&&wanted1.buttons==0,"Disney P1 desired state changed");Check(wanted2.buttons==0x2000&&wanted2.leftX==-32767&&wanted2.rightTrigger==0,"Disney P2 desired state leaked from P1");Check(wanted3.rightY==0&&wanted3.rightX==-32767&&wanted3.leftTrigger==255&&wanted3.buttons==0x8000,"Disney P3 desired state leaked from another player");Check(wanted4.rightY==-32767&&wanted4.rightX==32767&&wanted4.buttons==0x8040,"Disney P4 desired state leaked from another player");
independentPads[1].Reset();Check(Neutral((VirtualRacingGamepad.Report)wantedField.GetValue(independentPads[1]))&&((VirtualRacingGamepad.Report)wantedField.GetValue(independentPads[0])).rightTrigger==255&&((VirtualRacingGamepad.Report)wantedField.GetValue(independentPads[3])).buttons==0x8040,"Reset P2 must release only P2 state");for(int index=0;index<4;index++){independentPads[index].Reset();Check(Neutral((VirtualRacingGamepad.Report)wantedField.GetValue(independentPads[index])),"Reset must release every Disney player state");}
bool noKeyboard=false;try{keyboardMapping.Invoke(null,new object[]{1,"menu"});}catch(TargetInvocationException error){noKeyboard=error.InnerException is InvalidOperationException;}Check(noKeyboard,"Disney must never inherit Idol keyboard bindings");
var p3=(VirtualRacingGamepad)FormatterServices.GetUninitializedObject(typeof(VirtualRacingGamepad));var p4=(VirtualRacingGamepad)FormatterServices.GetUninitializedObject(typeof(VirtualRacingGamepad));var four=new[]{p1,p2,p3,p4};for(int index=0;index<4;index++){available.SetValue(four[index],true);target.SetValue(four[index],new IntPtr(index+1));accept.SetValue(four[index],true);receive.Invoke(four[index],new object[]{IntPtr.Zero,IntPtr.Zero,(byte)((index+1)*10),(byte)0,(byte)0,IntPtr.Zero});}
typeof(InputBridge).GetField("Gamepads",statics).SetValue(null,four);typeof(InputBridge).GetField("epoch",statics).SetValue(null,(long)61);capture=new StringWriter();Console.SetOut(capture);try{forward.Invoke(null,new object[]{true});forward.Invoke(null,new object[]{false});}finally{Console.SetOut(saved);}lines=capture.ToString().Split(new[]{'\r','\n'},StringSplitOptions.RemoveEmptyEntries);Check(lines.Length==8,"Disney rumble must emit four distinct slots and four immediate stops");for(int index=0;index<4;index++){var motor=json.Deserialize<Dictionary<string,object>>(lines[index]);Check((int)motor["slot"]==index+1&&(int)motor["largeMotor"]==(index+1)*10&&(int)motor["epoch"]==61,"Disney motor feedback was routed to the wrong player");var stopped=json.Deserialize<Dictionary<string,object>>(lines[index+4]);Check((int)stopped["slot"]==index+1&&(int)stopped["largeMotor"]==0&&(int)stopped["smallMotor"]==0&&(int)stopped["epoch"]==61,"Disney motor stop must release the matching player immediately");}
typeof(InputBridge).GetField("Gamepads",statics).SetValue(null,null);var read=typeof(InputBridge).GetMethod("ReadSnapshot",statics);Func<string,bool> snapshot=text=>(bool)read.Invoke(null,new object[]{json.Deserialize<Dictionary<string,object>>(text)});capture=new StringWriter();Console.SetOut(capture);try{
Check(snapshot("{\"epoch\":62,\"controls\":\"menu\",\"players\":[{\"slot\":1,\"buttons\":[\"confirm\"]},{\"slot\":2,\"buttons\":[]},{\"slot\":3,\"buttons\":[]},{\"slot\":4,\"buttons\":[\"left\"]}]}"),"Disney four-player snapshot must parse without keyboard fallback");
Check(!snapshot("{\"epoch\":62,\"controls\":\"menu\",\"players\":[{\"slot\":5,\"buttons\":[]}]}"),"Fifth native player must be rejected");
Check(!snapshot("{\"epoch\":62,\"controls\":\"menu\",\"players\":[{\"slot\":1,\"buttons\":[]},{\"slot\":1,\"buttons\":[]}]}"),"Duplicate native slots must be rejected");
Check(!snapshot("{\"epoch\":62,\"controls\":\"menu\",\"players\":[{\"slot\":4,\"buttons\":[\"0x57\"]}]}"),"Arbitrary keycodes must be rejected");
Check(!snapshot("{\"epoch\":62,\"controls\":\"fight\",\"players\":[]}"),"Disney must reject Idol fight mode");
Check(!snapshot("{\"epoch\":61,\"controls\":\"menu\",\"players\":[]}"),"Old native epoch must be rejected");
Check(snapshot(json.Serialize(new{epoch=63,controls="race",players=new[]{new{slot=1,buttons=new[]{"a","right","lt","x"}},new{slot=2,buttons=new[]{"b","left","rt"}},new{slot=3,buttons=new[]{"up","l","select"}},new{slot=4,buttons=new[]{"down","r","y","start"}}}})),"Disney Race must accept simultaneous semantic controls for all four slots");
}finally{Console.SetOut(saved);}Check(((HashSet<int>)typeof(InputBridge).GetField("Wanted",statics).GetValue(null)).Count==0,"Disney without pads must never queue keyboard input");
var previousDisabled=Environment.GetEnvironmentVariable("WATERCONSOLE_DISABLE_GAMEPAD");Environment.SetEnvironmentVariable("WATERCONSOLE_DISABLE_GAMEPAD","1");try{typeof(InputBridge).GetMethod("InitializeGamepads",statics).Invoke(null,null);Check(!(bool)typeof(InputBridge).GetProperty("PadsActive",statics).GetValue(null,null),"Disabled bus must not pretend four gamepads are ready");var reason=(string)typeof(InputBridge).GetField("gamepadMessage",statics).GetValue(null);Check(reason.Contains("four independent")&&!reason.Contains("P1 keyboard"),"Disney driver failure must not promise keyboard fallback");}finally{Environment.SetEnvironmentVariable("WATERCONSOLE_DISABLE_GAMEPAD",previousDisabled);}
Check((bool)identity.Invoke(null,new object[]{"Brawlhalla.exe"}),"Brawlhalla executable identity must be recognized");
Check(typeof(InputBridge).GetField("Game",statics).GetValue(null).ToString()=="Brawlhalla","Brawlhalla must retain its explicit SupportedGame identity");
Check((int)typeof(InputBridge).GetProperty("PlayerLimit",statics).GetValue(null,null)==4,"Brawlhalla must expose four native player slots");
Check((bool)typeof(InputBridge).GetProperty("UsesGamepads",statics).GetValue(null,null)&&(bool)typeof(InputBridge).GetProperty("GamepadOnly",statics).GetValue(null,null),"Brawlhalla must require virtual pads for every player");
Check((string)typeof(InputBridge).GetProperty("GamepadProfile",statics).GetValue(null,null)=="brawlhalla"&&(string)typeof(InputBridge).GetProperty("ActiveControls",statics).GetValue(null,null)=="fight","Brawlhalla must dispatch its own Fight profile");
var brawlLeft=Brawl("fight","left");var brawlRight=Brawl("fight","right");var brawlUp=Brawl("fight","up");var brawlDown=Brawl("fight","down");
Check(brawlLeft.leftX==-32767&&brawlRight.leftX==32767&&brawlUp.leftY==32767&&brawlDown.leftY==-32767&&brawlLeft.buttons==0&&brawlUp.buttons==0,"Brawlhalla movement must use left-stick axes without extra buttons");
Check(Neutral(Brawl("fight","left","right","up","down")),"Opposed Brawlhalla directions must cancel");
Check(Brawl("fight","a").buttons==0x1000&&Brawl("fight","confirm").buttons==0x1000,"Brawlhalla Jump and Confirm must use A");
Check(Brawl("fight","b").buttons==0x2000&&Brawl("fight","back").buttons==0x2000,"Brawlhalla Heavy and Back must use B");
Check(Brawl("fight","x").buttons==0x4000,"Brawlhalla Quick/Pickup must use X");
Check(Brawl("fight","y").buttons==0x0200&&Brawl("fight","y").rightTrigger==0,"Brawlhalla Throw must use RB without dodge");
Check(Brawl("menu","y").buttons==0x8000,"Brawlhalla Menu Y must remain separate from Fight Throw");
Check(Brawl("fight","l").buttons==0x0100&&Brawl("fight","r").buttons==0x0200,"Brawlhalla shoulder actions must remain LB/RB");
var brawlDodgeLeft=Brawl("fight","lt");var brawlDodgeRight=Brawl("fight","rt");Check(brawlDodgeLeft.leftTrigger==255&&brawlDodgeLeft.rightTrigger==0&&brawlDodgeLeft.buttons==0&&brawlDodgeRight.rightTrigger==255&&brawlDodgeRight.leftTrigger==0&&brawlDodgeRight.buttons==0,"Brawlhalla dodge triggers must remain independent");
var brawlEmote=Brawl("fight","select");Check(brawlEmote.rightY==32767&&brawlEmote.buttons==0&&brawlEmote.rightX==0,"Brawlhalla Emote must use right-stick up without Back");
var brawlMenuBack=Brawl("menu","select");Check(brawlMenuBack.buttons==0x0020&&brawlMenuBack.rightY==0,"Brawlhalla Menu Select must use Back without Emote");
Check(Brawl("fight","start").buttons==0x0010&&Brawl("menu","start").buttons==0x0010,"Brawlhalla Pause/Start must use Start in either mode");
var brawlCombination=Brawl("fight","left","up","a","x","y","lt","rt","select");Check(brawlCombination.leftX==-32767&&brawlCombination.leftY==32767&&brawlCombination.buttons==0x5200&&brawlCombination.leftTrigger==255&&brawlCombination.rightTrigger==255&&brawlCombination.rightY==32767&&brawlCombination.rightX==0,"Brawlhalla movement, Jump, Quick, Throw, Dodge and Emote must coexist");
Check(Brawl("fight","a","confirm","b","back","y","r").buttons==0x3200,"Brawlhalla semantic aliases must not alter other buttons");
var brawlMenu=Brawl("menu","left","up","confirm","back","x","y","l","r","lt","rt","start","select");Check(brawlMenu.leftX==-32767&&brawlMenu.leftY==32767&&brawlMenu.buttons==0xF330&&brawlMenu.leftTrigger==255&&brawlMenu.rightTrigger==255&&brawlMenu.rightY==0,"Brawlhalla Menu must have its own complete fixed controls");
Check(Neutral(Brawl("fight"))&&Neutral(Brawl("menu")),"Empty Brawlhalla snapshots must release all controls in either mode");
bool brawlRejectedMode=false;try{Brawl("race","a");}catch(InvalidOperationException){brawlRejectedMode=true;}Check(brawlRejectedMode,"Brawlhalla must reject Race mapping");
var brawlPads=new VirtualRacingGamepad[4];var brawlActions=new[]{new[]{"left","a"},new[]{"right","b","rt"},new[]{"up","x","lt"},new[]{"down","y","select"}};for(int index=0;index<4;index++){brawlPads[index]=(VirtualRacingGamepad)FormatterServices.GetUninitializedObject(typeof(VirtualRacingGamepad));brawlPads[index].Want(brawlActions[index],"fight","brawlhalla");}
var brawlP1=(VirtualRacingGamepad.Report)wantedField.GetValue(brawlPads[0]);var brawlP2=(VirtualRacingGamepad.Report)wantedField.GetValue(brawlPads[1]);var brawlP3=(VirtualRacingGamepad.Report)wantedField.GetValue(brawlPads[2]);var brawlP4=(VirtualRacingGamepad.Report)wantedField.GetValue(brawlPads[3]);
Check(brawlP1.leftX==-32767&&brawlP1.buttons==0x1000&&brawlP1.rightTrigger==0,"Brawlhalla P1 desired state must remain independent");
Check(brawlP2.leftX==32767&&brawlP2.buttons==0x2000&&brawlP2.rightTrigger==255&&brawlP2.leftTrigger==0,"Brawlhalla P2 desired state must remain independent");
Check(brawlP3.leftY==32767&&brawlP3.buttons==0x4000&&brawlP3.leftTrigger==255&&brawlP3.leftX==0,"Brawlhalla P3 desired state must remain independent");
Check(brawlP4.leftY==-32767&&brawlP4.buttons==0x0200&&brawlP4.rightY==32767&&brawlP4.rightTrigger==0,"Brawlhalla P4 desired state must remain independent");
brawlPads[1].Reset();Check(Neutral((VirtualRacingGamepad.Report)wantedField.GetValue(brawlPads[1]))&&((VirtualRacingGamepad.Report)wantedField.GetValue(brawlPads[0])).buttons==0x1000&&((VirtualRacingGamepad.Report)wantedField.GetValue(brawlPads[3])).rightY==32767,"Resetting Brawlhalla P2 must not reset another player");
for(int index=0;index<4;index++){brawlPads[index].Reset();Check(Neutral((VirtualRacingGamepad.Report)wantedField.GetValue(brawlPads[index])),"Reset must release each Brawlhalla player's complete desired state");}
var brawlPadsField=typeof(InputBridge).GetField("Gamepads",statics);var brawlPadsActive=typeof(InputBridge).GetProperty("PadsActive",statics);
Check(!(bool)brawlPadsActive.GetValue(null,null),"Brawlhalla cannot be ready without gamepads");
for(int index=0;index<4;index++){available.SetValue(brawlPads[index],true);target.SetValue(brawlPads[index],new IntPtr(index+1));}brawlPadsField.SetValue(null,brawlPads);Check((bool)brawlPadsActive.GetValue(null,null),"Brawlhalla must accept four mock attached gamepads");
brawlPadsField.SetValue(null,new[]{brawlPads[0],brawlPads[1]});Check(!(bool)brawlPadsActive.GetValue(null,null),"Brawlhalla must not be ready with only two gamepads");
brawlPadsField.SetValue(null,new[]{brawlPads[0],brawlPads[1],brawlPads[2]});Check(!(bool)brawlPadsActive.GetValue(null,null),"Brawlhalla must not be ready with only three gamepads");
brawlPadsField.SetValue(null,new[]{brawlPads[0],brawlPads[1],brawlPads[2],(VirtualRacingGamepad)null});Check(!(bool)brawlPadsActive.GetValue(null,null),"Brawlhalla must reject a missing fourth gamepad");
brawlPadsField.SetValue(null,brawlPads);available.SetValue(brawlPads[3],false);Check(!(bool)brawlPadsActive.GetValue(null,null),"Brawlhalla must reject one unavailable gamepad");available.SetValue(brawlPads[3],true);target.SetValue(brawlPads[3],IntPtr.Zero);Check(!(bool)brawlPadsActive.GetValue(null,null),"Brawlhalla must reject one detached gamepad");
brawlPadsField.SetValue(null,null);for(int index=0;index<4;index++){target.SetValue(brawlPads[index],IntPtr.Zero);available.SetValue(brawlPads[index],false);}
for(int index=0;index<4;index++){bool brawlNoKeyboard=false;try{keyboardMapping.Invoke(null,new object[]{index+1,"fight"});}catch(TargetInvocationException error){brawlNoKeyboard=error.InnerException is InvalidOperationException;}Check(brawlNoKeyboard,"Brawlhalla must never queue a fallback keyboard mapping for any player");}
var brawlPreviousDisabled=Environment.GetEnvironmentVariable("WATERCONSOLE_DISABLE_GAMEPAD");Environment.SetEnvironmentVariable("WATERCONSOLE_DISABLE_GAMEPAD","1");try{typeof(InputBridge).GetMethod("InitializeGamepads",statics).Invoke(null,null);Check(!(bool)brawlPadsActive.GetValue(null,null)&&brawlPadsField.GetValue(null)==null,"Disabled Brawlhalla gamepads must stay unavailable without creating targets");var brawlReason=(string)typeof(InputBridge).GetField("gamepadMessage",statics).GetValue(null);Check(brawlReason.Contains("Brawlhalla requires four independent")&&!brawlReason.Contains("P1 keyboard"),"Brawlhalla driver failure must identify the four-pad requirement without keyboard fallback");}finally{Environment.SetEnvironmentVariable("WATERCONSOLE_DISABLE_GAMEPAD",brawlPreviousDisabled);}
capture=new StringWriter();Console.SetOut(capture);try{
Check(snapshot(json.Serialize(new{epoch=70,controls="menu",players=new[]{new{slot=1,buttons=new[]{"confirm"}},new{slot=2,buttons=new[]{"back"}},new{slot=3,buttons=new[]{"left"}},new{slot=4,buttons=new[]{"right"}}}})),"Brawlhalla Menu must accept four independent semantic snapshots");
Check(snapshot(json.Serialize(new{epoch=71,controls="fight",players=new[]{new{slot=1,buttons=new[]{"a","left"}},new{slot=2,buttons=new[]{"b","rt"}},new{slot=3,buttons=new[]{"x","up","lt"}},new{slot=4,buttons=new[]{"y","down","select"}}}})),"Brawlhalla Fight must accept simultaneous semantic controls for all four slots");
Check(!snapshot(json.Serialize(new{epoch=71,controls="race",players=new object[0]})),"Brawlhalla snapshot must reject Race mode");
Check(!snapshot(json.Serialize(new{epoch=71,controls="fight",players=new[]{new{slot=0,buttons=new string[0]}}})),"Brawlhalla snapshot must reject slot zero");
Check(!snapshot(json.Serialize(new{epoch=71,controls="fight",players=new[]{new{slot=5,buttons=new string[0]}}})),"Brawlhalla snapshot must reject a fifth player");
Check(!snapshot(json.Serialize(new{epoch=71,controls="fight",players=new[]{new{slot=1,buttons=new string[0]},new{slot=1,buttons=new string[0]}}})),"Brawlhalla snapshot must reject duplicate slots");
Check(!snapshot(json.Serialize(new{epoch=71,controls="fight",players=new[]{new{slot=4,buttons=new[]{"0x57"}}}})),"Brawlhalla snapshot must reject arbitrary keycodes");
Check(!snapshot(json.Serialize(new{epoch=71,controls="fight",players=new[]{new{slot=4,buttons=new[]{"shell"}}}})),"Brawlhalla snapshot must reject unknown semantic actions");
Check(!snapshot(json.Serialize(new{epoch=71,controls="fight",players=new[]{new{slot=4,buttons=new[]{1}}}})),"Brawlhalla snapshot must reject nonstring buttons");
Check(!snapshot(json.Serialize(new{epoch=70,controls="fight",players=new object[0]})),"Brawlhalla snapshot must reject old epochs");
Check(!snapshot(json.Serialize(new{epoch=-1,controls="fight",players=new object[0]})),"Brawlhalla snapshot must reject negative epochs");
Check(!snapshot(json.Serialize(new{epoch=71.5,controls="fight",players=new object[0]})),"Brawlhalla snapshot must reject fractional epochs");
Check((long)typeof(InputBridge).GetField("epoch",statics).GetValue(null)==71&&(string)typeof(InputBridge).GetField("controls",statics).GetValue(null)=="fight","Rejected Brawlhalla snapshots must not change the active epoch or mode");
Check(snapshot(json.Serialize(new{epoch=72,controls="menu",players=new object[0]})),"Brawlhalla may return to Menu with an empty neutral snapshot");
}finally{Console.SetOut(saved);}
Check(((HashSet<int>)typeof(InputBridge).GetField("Wanted",statics).GetValue(null)).Count==0,"Brawlhalla without pads must never queue keyboard input");
identity.Invoke(null,new object[]{"Idol Showdown.exe"});var idol1=(Dictionary<string,int>)keyboardMapping.Invoke(null,new object[]{1,"fight"});var idol2=(Dictionary<string,int>)keyboardMapping.Invoke(null,new object[]{2,"fight"});Check(idol1["up"]==0x57&&idol2["up"]==0x26&&idol1["x"]==0x4a&&idol2["x"]==0x64,"Idol P1/P2 mappings changed during native dispatch refactor");Check((int)typeof(InputBridge).GetProperty("PlayerLimit",statics).GetValue(null,null)==2,"Idol player limit must stay two");Check(!(bool)identity.Invoke(null,new object[]{"UnknownGame.exe"}),"Unknown executable must be rejected");
Console.WriteLine(checks+" native mapping, identity, four-slot validation and callback checks passed; mocked callbacks only, no controller created or input injected.");}}
`,
);
const mapping = path.join(output, "GamepadMappingProbe.exe");
run(compiler, [
  "/nologo",
  "/platform:x64",
  "/reference:System.Web.Extensions.dll",
  "/main:GamepadMappingProbe",
  "/out:" + mapping,
  source,
  path.resolve("src/native/VirtualRacingGamepad.cs"),
  path.resolve("src/native/InputBridge.cs"),
]);
const mappingResult = run(mapping, []).trim();
const helper = path.join(output, "WaterConsole.InputBridge.exe");
run(compiler, [
  "/nologo",
  "/platform:x64",
  "/reference:System.Web.Extensions.dll",
  "/out:" + helper,
  path.resolve("src/native/InputBridge.cs"),
  path.resolve("src/native/VirtualRacingGamepad.cs"),
]);
const clientRoot = path.resolve("assets/native/vigem");
const metadata = JSON.parse(
  (await readFile(path.join(clientRoot, "SOURCE.json"), "utf8")).replace(
    /^\uFEFF/,
    "",
  ),
);
const client = await readFile(path.join(clientRoot, "ViGEmClient.dll"));
assert.equal(
  createHash("sha256").update(client).digest("hex"),
  metadata.sha256,
);
await copyFile(
  path.join(clientRoot, "ViGEmClient.dll"),
  path.join(output, "ViGEmClient.dll"),
);
const status = pureOnly
  ? { gamepad: { skipped: true } }
  : JSON.parse(run(helper, ["--gamepad-status"]));
if (!pureOnly) assert.equal(typeof status.gamepad.available, "boolean");
if (!pureOnly && !status.gamepad.available)
  assert.match(
    status.gamepad.message,
    /gamepads.*driver|gamepad unavailable|gamepads are disabled/i,
  );
const report = {
  passed: true,
  at: new Date().toISOString(),
  checks: [
    mappingResult,
    "Bridge and optional client compile with installed .NET Framework compiler.",
    "Pinned x64 client checksum matches source provenance.",
    pureOnly
      ? "Driver probe skipped for isolated pure checks."
      : "Read-only driver status probe returns bounded gamepad availability without creating a target.",
  ],
  gamepad: status.gamepad,
  limits:
    "No original game was launched or controller created by the pure checks; live four-player joining, gameplay, game rumble and focus/watchdog/EOF pad release require a separate opt-in native test.",
};
await writeFile(
  path.join(output, "report.json"),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
