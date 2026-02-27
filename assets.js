// assets.js — image loader
// Call loadAssets(onReady) before drawing anything.

const ASSETS = {
  shark: null,
  orca:  null,
  seal:  null,
  crab:  null,
};

function loadAssets(onReady) {
  const files = {
    shark: 'assets/hai.png',
    orca:  'assets/whale.png',
    seal:  'assets/seal-monk.png',
    crab:  'assets/crab.png',
  };

  let remaining = Object.keys(files).length;

  for (const [key, src] of Object.entries(files)) {
    const img = new Image();
    img.onload = () => {
      remaining--;
      if (remaining === 0) onReady();
    };
    img.onerror = () => {
      console.warn('Could not load asset:', src);
      remaining--;
      if (remaining === 0) onReady();
    };
    img.src = src;
    ASSETS[key] = img;
  }
}
