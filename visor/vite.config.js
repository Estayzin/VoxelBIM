import { resolve } from 'path';

export default {
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 10000,
    rollupOptions: {
      input: resolve(__dirname, 'voxelbim.html'),
    },
  }
};
