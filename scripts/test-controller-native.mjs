import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { KEYS } from "../src/shared/studio-model.ts";

const root = process.cwd(), output = path.join(root, ".local/controller-input-check");
await mkdir(output, { recursive: true });
const browser = JSON.parse(await readFile(path.join(output, "report.json"), "utf8"));
assert.ok(browser.frames.length >= 150 && browser.checks.some(check => check.includes("ANSI104")), "Run the completed browser input matrix first");
assert.deepEqual(browser.errors, [], "Browser checks must finish without page errors");
const bits = { up: 1, down: 2, left: 4, right: 8, start: 16, select: 32, ls: 64, rs: 128, l: 256, r: 512, a: 4096, b: 8192, x: 16384, y: 32768 };
const cases = browser.frames.map(frame => ({ ...frame, expected: { buttons: frame.output.buttons.reduce((mask, button) => mask | bits[button], 0), leftTrigger: frame.output.axes.lt * 255, rightTrigger: frame.output.axes.rt * 255, leftX: frame.output.axes.lx * 32767, leftY: frame.output.axes.ly * 32767, rightX: frame.output.axes.rx * 32767, rightY: frame.output.axes.ry * 32767 } }));
cases.push({ name: "Partial analog values and independent trigger bytes", output: { buttons: ["a", "r", "ls"], keys: ["ShiftLeft", "Space"], axes: { lx: .5, ly: -.5, rx: .25, ry: -1, lt: .25, rt: .75 } }, expected: { buttons: 0x1240, leftTrigger: 64, rightTrigger: 191, leftX: 16384, leftY: -16384, rightX: 8192, rightY: -32767 } });
const vk = { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Space: 32, Enter: 13, Escape: 27, Tab: 9, Shift: 16, Control: 17, Alt: 18, Backspace: 8, Backquote: 192, Minus: 189, Equal: 187, BracketLeft: 219, BracketRight: 221, Backslash: 220, Semicolon: 186, Quote: 222, Comma: 188, Period: 190, Slash: 191, Insert: 45, Delete: 46, Home: 36, End: 35, PageUp: 33, PageDown: 34, NumpadAdd: 107, NumpadSubtract: 109, NumpadMultiply: 106, NumpadDivide: 111, NumpadDecimal: 110, NumpadEnter: 13, ShiftLeft: 160, ShiftRight: 161, ControlLeft: 162, ControlRight: 163, AltLeft: 164, AltRight: 165 };
for (const c of "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") vk[c] = c.charCodeAt(0);
for (let i = 1; i <= 12; i++) vk["F" + i] = 111 + i;
for (let i = 0; i < 10; i++) vk["Numpad" + i] = 96 + i;
const extended = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Insert", "Delete", "Home", "End", "PageUp", "PageDown", "NumpadEnter", "NumpadDivide", "ControlRight", "AltRight"]);
const keys = KEYS.map(name => { assert.ok(vk[name]); return { name, vk: vk[name], flags: extended.has(name) ? 1 : 0 }; });
await writeFile(path.join(output, "native-cases.json"), JSON.stringify({ cases, keys }));
const source = String.raw`
using System;
using System.Collections.Generic;
using System.Collections;
using System.Reflection;
using System.Runtime.InteropServices;
using System.IO;
using System.Linq;
using System.Web.Script.Serialization;
class ControllerOutputCheck {
 static int checks;
 static void Check(bool condition,string message) { if(!condition) throw new Exception(message); checks++; }
 static object Field(object value,string name) { return value.GetType().GetField(name,BindingFlags.Instance|BindingFlags.Public|BindingFlags.NonPublic).GetValue(value); }
 static void Compare(VirtualGamepad.Report r,Dictionary<string,object> expected,string name) {
  Check(r.buttons==Convert.ToInt32(expected["buttons"]),name+" button bitmask");
  Check(r.leftTrigger==Convert.ToInt32(expected["leftTrigger"]),name+" LT byte");
  Check(r.rightTrigger==Convert.ToInt32(expected["rightTrigger"]),name+" RT byte");
  Check(r.leftX==Convert.ToInt32(expected["leftX"]),name+" left X");
  Check(r.leftY==Convert.ToInt32(expected["leftY"]),name+" left Y");
  Check(r.rightX==Convert.ToInt32(expected["rightX"]),name+" right X");
  Check(r.rightY==Convert.ToInt32(expected["rightY"]),name+" right Y");
 }
 static int Main(string[] args) {
  var json=new JavaScriptSerializer(); var data=(Dictionary<string,object>)json.DeserializeObject(File.ReadAllText(args[0]));
  Check(Marshal.SizeOf(typeof(VirtualGamepad.Report))==12,"XInput report struct size");
  foreach(var item in (object[])data["cases"]) {
   var c=(Dictionary<string,object>)item; var keys=new HashSet<string>(); var input=(Dictionary<string,object>)c["output"];
   var r=UserBridge.ParseReport(input,keys); Compare(r,(Dictionary<string,object>)c["expected"],(string)c["name"]);
   Check(keys.SetEquals(((object[])input["keys"]).Cast<string>()),(string)c["name"]+" keyboard set");
  }
  var keyEvent=typeof(UserBridge).GetMethod("KeyEvent",BindingFlags.Static|BindingFlags.NonPublic);
  var nativeKeys=(IDictionary)typeof(UserBridge).GetField("KeyCodes",BindingFlags.Static|BindingFlags.NonPublic).GetValue(null);
  Check(nativeKeys.Count==((object[])data["keys"]).Length,"No keyboard key lost between TypeScript and native helper");
  foreach(var item in (object[])data["keys"]) {
   var k=(Dictionary<string,object>)item; var name=(string)k["name"];
   foreach(bool up in new[]{false,true}) {
    var input=keyEvent.Invoke(null,new object[]{name,up}); var key=Field(Field(input,"data"),"key");
    Check(Convert.ToUInt16(Field(key,"vk"))==Convert.ToInt32(k["vk"]),name+" virtual key");
    Check(Convert.ToUInt32(Field(key,"flags"))==Convert.ToUInt32(k["flags"])+(up?2u:0u),name+" press/release flags");
   }
  }
  Console.WriteLine(json.Serialize(new {checks=checks,browserFrames=((object[])data["cases"]).Length,keyboardKeys=((object[])data["keys"]).Length,nativeDevicesCreated=false,osInputSent=false}));
  return 0;
 }
}`;
const code = path.join(output, "ControllerOutputCheck.cs"), executable = path.join(output, "ControllerOutputCheck.exe");
await writeFile(code, source);
const run = (file, args) => { const result = spawnSync(file, args, { cwd: root, encoding: "utf8", windowsHide: true, timeout: 30000 }); if (result.error) throw result.error; assert.equal(result.status, 0, result.stdout + result.stderr); return result.stdout.trim(); };
run(path.join(process.env.WINDIR || "C:/Windows", "Microsoft.NET/Framework64/v4.0.30319/csc.exe"), ["/nologo", "/target:exe", "/platform:x64", "/main:ControllerOutputCheck", "/reference:System.Web.Extensions.dll", "/out:" + executable, code, path.join(root, "toolkit/native/UserBridge.cs"), path.join(root, "toolkit/native/VirtualGamepad.cs")]);
const result = JSON.parse(run(executable, [path.join(output, "native-cases.json")]));
await writeFile(path.join(output, "native-report.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
