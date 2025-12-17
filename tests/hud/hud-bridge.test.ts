class MockBroadcastChannel {
  static channels = new Map<string, Set<MockBroadcastChannel>>();

  public onmessage: ((ev: { data: any }) => void) | null = null;
  private readonly channelName: string;

  constructor(name: string) {
    this.channelName = name;
    if (!MockBroadcastChannel.channels.has(name)) {
      MockBroadcastChannel.channels.set(name, new Set());
    }
    MockBroadcastChannel.channels.get(name)!.add(this);
  }

  postMessage(data: any) {
    const peers = MockBroadcastChannel.channels.get(this.channelName);
    if (!peers) return;
    for (const peer of peers) {
      if (peer === this) continue;
      peer.onmessage?.({ data });
    }
  }

  close() {
    MockBroadcastChannel.channels.get(this.channelName)?.delete(this);
  }
}

test('hud bridge sync handshake replies with state/append/snapshot', async () => {
  (globalThis as any).BroadcastChannel = MockBroadcastChannel;

  const { createHudBridge } = await import('../../src/hud/bridge');

  const main = createHudBridge('hud-smoke');
  const pop = createHudBridge('hud-smoke');
  const received: any[] = [];

  pop.on((msg) => {
    received.push(msg);
  });

  main.on((msg) => {
    if (msg.type === 'hud:requestSync') {
      main.send({ type: 'hud:state', state: { open: true, frozen: false, popout: true, x: 12, y: 64 } });
      main.send({ type: 'hud:append', lines: ['boot'] });
      main.send({ type: 'hud:snapshot', text: 'snapshot' });
    }
  });

  pop.send({ type: 'hud:requestSync' });

  await new Promise((resolve) => setTimeout(resolve, 20));

  expect(received.some((msg) => msg.type === 'hud:state')).toBe(true);
  expect(received.some((msg) => msg.type === 'hud:append')).toBe(true);
  expect(received.some((msg) => msg.type === 'hud:snapshot')).toBe(true);

  main.close();
  pop.close();
});
