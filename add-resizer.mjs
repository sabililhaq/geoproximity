import fs from 'fs';
const content = fs.readFileSync('src/app.ts', 'utf8');
const searchStr = `  const clearBtn = qs<HTMLButtonElement>(root, "[data-clear]");`;
const replacement = `  const clearBtn = qs<HTMLButtonElement>(root, "[data-clear]");
  const resizer = root.querySelector("[data-px-resizer]") as HTMLElement | null;
  const layout = root.querySelector(".px-layout") as HTMLElement | null;`;

let newContent = content.replace(searchStr, replacement);

const resizerLogic = `
  if (resizer && layout) {
    let isDragging = false;
    let isVertical = true;
    let startPos = 0;
    let startSize = 0;
    
    resizer.addEventListener('pointerdown', (e) => {
      isDragging = true;
      resizer.setPointerCapture(e.pointerId);
      isVertical = getComputedStyle(resizer).cursor === 'row-resize';
      startPos = isVertical ? e.clientY : e.clientX;
      startSize = isVertical 
        ? layout.querySelector('.px-sidebar')?.getBoundingClientRect().height || 0
        : layout.querySelector('.px-sidebar')?.getBoundingClientRect().width || 0;
      e.preventDefault();
    });

    resizer.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const delta = isVertical ? (startPos - e.clientY) : (startPos - e.clientX);
      const newSize = Math.max(200, startSize + delta);
      if (isVertical) {
        layout.style.setProperty('--px-sidebar-h', \`\${newSize}px\`);
      } else {
        layout.style.setProperty('--px-sidebar-w', \`\${newSize}px\`);
      }
      map.invalidateSize();
    });

    resizer.addEventListener('pointerup', (e) => {
      isDragging = false;
      resizer.releasePointerCapture(e.pointerId);
    });
    resizer.addEventListener('pointercancel', (e) => {
      isDragging = false;
      resizer.releasePointerCapture(e.pointerId);
    });
  }
`;

const mapInitStr = `  const resize = new ResizeObserver(() => map.invalidateSize());`;
newContent = newContent.replace(mapInitStr, mapInitStr + resizerLogic);

fs.writeFileSync('src/app.ts', newContent);
