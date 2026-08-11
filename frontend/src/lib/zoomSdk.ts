export const REACT_SCRIPT = '/zoom/sdk/react.development.js';
export const REACTDOM_SCRIPT = '/zoom/sdk/react-dom.development.js';
export const EMBEDDED_SDK_SCRIPT = '/zoom/zoomus-websdk-embedded.umd.min.js';
export const ZOOM_ASSET_PATH = 'https://source.zoom.us/6.2.0/lib/av';

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(s);
  });
}

export async function createEmbeddedClient(): Promise<any> {
  if (!(window as any).React) await loadScript(REACT_SCRIPT);
  if (!(window as any).ReactDOM) await loadScript(REACTDOM_SCRIPT);
  if (!(window as any).ReactWidgets) await loadScript(EMBEDDED_SDK_SCRIPT);

  const Embedded = (window as any).ReactWidgets as any;
  if (!Embedded?.createClient) {
    throw new Error('Failed to load Zoom Embedded SDK');
  }
  return Embedded.createClient();
}
