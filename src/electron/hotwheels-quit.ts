import type { Action } from "../shared/types";

interface QuitPort {
  requestClose(): Promise<void>;
  isRunning(): boolean;
  focused(): boolean;
  input(buttons: Action[]): void;
  wait(ms: number): Promise<void>;
  now(): number;
}

// This sequence is only used for an owned HOT WHEELS process after a Stop request.
export async function confirmHotwheelsQuit(port: QuitPort): Promise<boolean> {
  await port.requestClose();
  await port.wait(450);
  if (!port.isRunning()) return true;
  try {
    for (const buttons of [["right"], [], ["confirm"], []] as Action[][]) {
      if (!port.isRunning()) return true;
      if (!port.focused()) return false;
      port.input(buttons);
      await port.wait(buttons.length ? 100 : 120);
    }
  } finally {
    port.input([]);
  }
  const deadline = port.now() + 6000;
  while (port.isRunning() && port.now() < deadline) await port.wait(100);
  return !port.isRunning();
}

// A close request alone does not establish that the native process has exited.
export async function waitForNativeQuit(port: QuitPort): Promise<boolean> {
  await port.requestClose();
  const deadline = port.now() + 6000;
  while (port.isRunning() && port.now() < deadline) await port.wait(100);
  return !port.isRunning();
}
