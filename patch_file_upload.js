import fs from 'fs';
let code = fs.readFileSync('src/components/SettingsView.tsx', 'utf8');

const newUploadLogic = `  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
          const rawDataUrl = event.target?.result as string;
          const img = new Image();
          img.onload = () => {
              // Resize and compress
              const MAX_WIDTH = 1920;
              const MAX_HEIGHT = 1080;
              let width = img.width;
              let height = img.height;
              
              if (width > height) {
                  if (width > MAX_WIDTH) {
                      height *= MAX_WIDTH / width;
                      width = MAX_WIDTH;
                  }
              } else {
                  if (height > MAX_HEIGHT) {
                      width *= MAX_HEIGHT / height;
                      height = MAX_HEIGHT;
                  }
              }
              
              const canvas = document.createElement('canvas');
              canvas.width = Math.floor(width);
              canvas.height = Math.floor(height);
              const ctx = canvas.getContext('2d');
              
              if (ctx) {
                  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                  // Compress down to ~0.7 to save space
                  const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
                  
                  // Now calculate dominant color from a small thumbnail
                  const thumbCanvas = document.createElement('canvas');
                  const thumbCtx = thumbCanvas.getContext('2d', { willReadFrequently: true });
                  if (thumbCtx) {
                      thumbCanvas.width = 100;
                      thumbCanvas.height = Math.floor(100 * (height / width));
                      thumbCtx.drawImage(img, 0, 0, thumbCanvas.width, thumbCanvas.height);
                      const imgData = thumbCtx.getImageData(0, 0, thumbCanvas.width, thumbCanvas.height);
                      
                      let r = 0, g = 0, b = 0, a = 0;
                      for (let i = 0; i < imgData.data.length; i += 4) {
                          r += imgData.data[i];
                          g += imgData.data[i + 1];
                          b += imgData.data[i + 2];
                          a++;
                      }
                      r = Math.floor(r / a);
                      g = Math.floor(g / a);
                      b = Math.floor(b / a);
                      
                      const max = Math.max(r, g, b);
                      if (max > 0) {
                          const boost = 255 / max;
                          r = Math.min(255, Math.floor(r * boost * 0.8));
                          g = Math.min(255, Math.floor(g * boost * 0.8));
                          b = Math.min(255, Math.floor(b * boost * 0.8));
                      }
                      
                      const dominantColor = \`rgb(\${r}, \${g}, \${b})\`;
                      document.documentElement.style.setProperty('--wallpaper-url', \`url("\${compressedDataUrl}")\`);
                      document.documentElement.style.setProperty('--theme-primary', dominantColor);
                      
                      try {
                          localStorage.setItem('custom_wallpaper_url', compressedDataUrl);
                          localStorage.setItem('custom_wallpaper_color', dominantColor);
                      } catch (e) {
                          alert("Failed to save wallpaper. The image might still be too large even after compression.");
                      }
                  }
              }
          };
          img.src = rawDataUrl;
      };
      reader.readAsDataURL(file);
      if (fileInputRef.current) fileInputRef.current.value = '';
  };`;

// replace between `const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {` and `  return (`
const regex = /const handleFileUpload = \(e: React.ChangeEvent<HTMLInputElement>\) => \{[\s\S]*?return \(/;

code = code.replace(regex, newUploadLogic + '\n  return (');

fs.writeFileSync('src/components/SettingsView.tsx', code);
