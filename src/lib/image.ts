// Verkleint en comprimeert een gekozen foto naar een JPEG data-URL.
// Houdt de opslag (en straks de database) licht — telefoonfoto's zijn anders al snel meerdere MB's.
export function fileNaarDataUrl(
  file: File,
  maxZijde = 1000,
  kwaliteit = 0.6
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Kon bestand niet lezen"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Kon afbeelding niet laden"));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxZijde || height > maxZijde) {
          const schaal = Math.min(maxZijde / width, maxZijde / height);
          width = Math.round(width * schaal);
          height = Math.round(height * schaal);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas niet beschikbaar"));
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", kwaliteit));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
