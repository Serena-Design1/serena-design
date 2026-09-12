// generate-feed.js
// Lit les produits stockés dans Firestore (collection "products") et génère
// un fichier feed.xml compatible avec Meta Commerce Manager (et Google Merchant).
//
// Utilisation locale : node generate-feed.js
// (dans le repo GitHub, ce script est lancé automatiquement par le workflow
//  .github/workflows/update-feed.yml)

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');
const fs = require('fs');

// Même configuration Firebase que celle utilisée dans index.html.
// Ces clés sont publiques (ce sont les clés client Firebase, pas des secrets).
const firebaseConfig = {
  apiKey: "AIzaSyDYEhV1ByY8WkVe9qvX0031Xm9BZ0QBUUM",
  authDomain: "serena-design.firebaseapp.com",
  projectId: "serena-design",
  storageBucket: "serena-design.firebasestorage.app",
  messagingSenderId: "917485534369",
  appId: "1:917485534369:web:9b212e7d94eafb1cd4c4e0"
};

const SITE_URL = "https://serenadesign.tn";
const BRAND = "Serena Design";

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Le champ "price" du site est un texte libre (ex: "1200", "1 200 DT", vide = "Sur devis").
// On essaie d'en extraire un nombre exploitable pour la publicité.
function parsePrice(raw) {
  if (!raw) return null;
  const cleaned = String(raw).replace(/[^0-9.,]/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  if (isNaN(num) || num <= 0) return null;
  return num.toFixed(2);
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const snap = await getDocs(collection(db, 'products'));

  const items = [];
  const ignored = [];

  snap.forEach((docSnap) => {
    const p = docSnap.data();
    const id = docSnap.id;
    const price = parsePrice(p.price);
    const images = Array.isArray(p.images) ? p.images.filter(Boolean) : [];

    // Un produit sans prix (ex: "Sur devis") ou sans image ne peut pas être
    // publié dans le catalogue publicitaire (Meta exige un prix et une image).
    if (!price || images.length === 0 || !p.name) {
      ignored.push(`${id} - ${p.name || '(sans nom)'}`);
      return;
    }

    items.push({
      id,
      title: p.name,
      description: p.desc && p.desc.trim() ? p.desc : p.name,
      link: `${SITE_URL}/?p=${id}`,
      image_link: images[0],
      additional_images: images.slice(1, 10),
      price: `${price} TND`,
      category: p.category || ''
    });
  });

  const itemsXml = items
    .map(
      (it) => `
    <item>
      <g:id>${escapeXml(it.id)}</g:id>
      <title>${escapeXml(it.title)}</title>
      <description>${escapeXml(it.description)}</description>
      <link>${escapeXml(it.link)}</link>
      <g:image_link>${escapeXml(it.image_link)}</g:image_link>
      ${it.additional_images
        .map((img) => `<g:additional_image_link>${escapeXml(img)}</g:additional_image_link>`)
        .join('\n      ')}
      <g:availability>in stock</g:availability>
      <g:condition>new</g:condition>
      <g:price>${it.price}</g:price>
      <g:brand>${escapeXml(BRAND)}</g:brand>
      <g:product_type>${escapeXml(it.category)}</g:product_type>
    </item>`
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
  <title>Serena Design - Catalogue</title>
  <link>${SITE_URL}</link>
  <description>Catalogue produits Serena Design</description>
${itemsXml}
</channel>
</rss>`;

  fs.writeFileSync('feed.xml', xml, 'utf8');

  console.log(`✅ Feed généré avec ${items.length} produit(s) dans feed.xml`);
  if (ignored.length) {
    console.log(`⚠️  ${ignored.length} produit(s) ignoré(s) (prix ou image manquant) :`);
    ignored.forEach((line) => console.log('   - ' + line));
  }
}

main().catch((err) => {
  console.error('Erreur lors de la génération du feed :', err);
  process.exit(1);
});
