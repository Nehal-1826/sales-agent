const fs = require('fs');
const path = require('path');

// Simple SVG to PNG conversion using built-in canvas
// We'll create SVG files that can be easily converted

const logos = [
  {
    name: 'sunset-gradient',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
    <defs>
      <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FF6B35"/>
        <stop offset="100%" stop-color="#FFB347"/>
      </linearGradient>
    </defs>
    <rect width="512" height="512" fill="url(#grad)"/>
    <rect x="60" y="80" width="392" height="230" rx="40" fill="rgba(255,255,255,0.2)"/>
    <rect x="80" y="100" width="352" height="180" rx="30" fill="#ffffff"/>
    <path d="M80 100 L256 200 L432 100" stroke="#FF8E53" stroke-width="10" fill="none" stroke-linecap="round"/>
    <circle cx="380" cy="320" r="40" fill="#FFB347"/>
    <circle cx="380" cy="320" r="20" fill="#ffffff"/>
  </svg>`
  },
  {
    name: 'minimalist-dark',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
    <rect width="512" height="512" fill="#1a1a26"/>
    <rect x="100" y="120" width="312" height="200" rx="40" fill="none" stroke="#FF6B35" stroke-width="10"/>
    <path d="M100 120 L256 210 L412 120" stroke="#FF6B35" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="350" cy="270" r="30" fill="#FF6B35"/>
    <circle cx="350" cy="270" r="14" fill="#FFB347"/>
  </svg>`
  },
  {
    name: 'vibrant-pop',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
    <defs>
      <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FF6B35"/>
        <stop offset="50%" stop-color="#FF8E53"/>
        <stop offset="100%" stop-color="#FFB347"/>
      </linearGradient>
      <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#FFD700"/>
        <stop offset="100%" stop-color="#FF6B35"/>
      </linearGradient>
    </defs>
    <rect width="512" height="512" fill="url(#grad)"/>
    <rect x="80" y="100" width="352" height="210" rx="36" fill="#ffffff"/>
    <path d="M80 100 L256 200 L432 100" stroke="url(#accent)" stroke-width="12" fill="none" stroke-linecap="round"/>
    <circle cx="380" cy="290" r="35" fill="url(#grad)"/>
    <circle cx="380" cy="290" r="20" fill="#FFD700"/>
  </svg>`
  },
  {
    name: 'modern-tech',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
    <defs>
      <filter id="glow">
        <feDropShadow dx="0" dy="0" stdDeviation="10" flood-color="#FF6B35" flood-opacity="0.8"/>
      </filter>
    </defs>
    <rect width="512" height="512" fill="#0f0f1a"/>
    <rect x="90" y="110" width="332" height="230" rx="40" fill="none" stroke="#FF6B35" stroke-width="8" filter="url(#glow)"/>
    <path d="M90 110 L256 210 L422 110" stroke="#FF6B35" stroke-width="8" fill="none" stroke-linecap="round"/>
    <line x1="90" y1="340" x2="422" y2="340" stroke="#FF6B35" stroke-width="8" stroke-linecap="round"/>
    <circle cx="360" cy="270" r="24" fill="#FF6B35" filter="url(#glow)"/>
    <circle cx="360" cy="270" r="12" fill="#FFB347"/>
  </svg>`
  },
  {
    name: 'premium-gold',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
    <defs>
      <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FFD700"/>
        <stop offset="50%" stop-color="#FFA500"/>
        <stop offset="100%" stop-color="#FF6B35"/>
      </linearGradient>
      <filter id="glow">
        <feDropShadow dx="0" dy="0" stdDeviation="8" flood-color="#FFD700" flood-opacity="0.6"/>
      </filter>
    </defs>
    <rect width="512" height="512" fill="#1a1a26"/>
    <rect x="100" y="120" width="312" height="190" rx="36" fill="none" stroke="url(#gold)" stroke-width="8"/>
    <path d="M100 120 L256 210 L412 120" stroke="url(#gold)" stroke-width="8" fill="none" stroke-linecap="round"/>
    <circle cx="350" cy="280" r="28" fill="url(#gold)" filter="url(#glow)"/>
    <circle cx="350" cy="280" r="14" fill="#FFD700"/>
  </svg>`
  },
  {
    name: 'bold-coral',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
    <defs>
      <linearGradient id="coral" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FF6B35"/>
        <stop offset="100%" stop-color="#E63946"/>
      </linearGradient>
    </defs>
    <rect width="512" height="512" fill="#ffffff"/>
    <rect x="70" y="90" width="372" height="240" rx="44" fill="url(#coral)"/>
    <path d="M70 90 L256 200 L442 90" stroke="#ffffff" stroke-width="12" fill="none" stroke-linecap="round"/>
    <circle cx="400" cy="290" r="35" fill="#E63946"/>
    <circle cx="400" cy="290" r="20" fill="#ffffff"/>
  </svg>`
  }
];

const outputDir = path.join(__dirname, '../public/logos');
fs.mkdirSync(outputDir, { recursive: true });

logos.forEach(logo => {
  const svgPath = path.join(outputDir, `${logo.name}.svg`);
  fs.writeFileSync(svgPath, logo.svg);
  console.log(`Created: ${logo.name}.svg`);
});

console.log('\n✓ Logo SVG files created!');
console.log('Location: frontend/public/logos/');
console.log('\nTo convert to PNG, use:');
console.log('  brew install svg2png  # macOS');
console.log('  apt-get install librsvg2-tools  # Linux');
console.log('  svg2png input.svg output.png');
