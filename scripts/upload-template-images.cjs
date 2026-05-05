const https = require("https");
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://xuvecgnuphvzjxtowqem.supabase.co";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1dmVjZ251cGh2emp4dG93cWVtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTQ3MzAwMiwiZXhwIjoyMDkxMDQ5MDAyfQ.E7MZXV-54P0J91WWXwhWVUdnEeZ1ACIpjpUN_5aL2Jo";

const TEMPLATE_IMAGE_MAP = {
  "amenity.editorial_catalog.symbolic_centerpiece.magazine_spread.v1": "1. Symbolic Amenity Editorial.png",
  "amenity.graphic_led.symbolic_centerpiece.blob_cutout.v1": "2. Graphic Amenity Blob.png",
  "amenity.minimal.symbolic_centerpiece.card_stack.v1": "3. Minimal Amenity Card.png",
  "amenity.quiet_luxury.amenity_scene.centered_symmetry.v1": "4. Quiet Amenity Scene.png",
  "location.graphic_led.symbolic_centerpiece.infographic_map.v1": "5. Location Orbit Infographic.png",
  "location.minimal.symbolic_centerpiece.centered_symmetry.v1": "6. Minimal Location Signal.png",
  "location.swiss_grid.symbolic_centerpiece.swiss_grid.v1": "7. Swiss Location Facts.png",
  "pricing_ad.brutalist.proposition_box.bold_offer_centerpiece.v1": "8. Brutalist Premium Offer.png",
  "pricing_ad.editorial_catalog.facade_crop.split_grid.v1": "9. Editorial Price Split.png",
  "pricing_ad.graphic_led.cutout_offer.blob_stack.v1": "10. Premium Cutout Offer Blob Stack.png",
  "pricing_ad.graphic_led.proposition_box.split_grid.v1": "11. Graphic Offer Split.png",
  "pricing_ad.minimal.proposition_box.card_stack.v1": "12. Minimal Price Card Stack.png",
  "pricing_ad.swiss_grid.subtle_architecture.bold_offer_centerpiece.v1": "13. Swiss Offer Centerpiece.png",
  "project_launch.art_poster.cutout_hero.abstract_shape_field.v1": "14. Abstract Shape Tower Cutout Poster.png",
  "project_launch.art_poster.cutout_hero.sun_disc.v1": "15. Art Poster Sun Disc Cutout.png",
  "project_launch.bold_typographic.facade_mask.poster_stack.v1": "16. Bold Typographic Facade Mask.png",
  "project_launch.cinematic_crop.noir_premium.title_card.v1": "17. Cinematic Noir Title Card.png",
  "project_launch.editorial_catalog.tower_hero.magazine_spread.v1": "18. Editorial Tower Magazine Launch.png",
  "project_launch.graphic_led.cutout_hero.blob_composition.v1": "19. Premium Cutout Blob Launch.png",
  "project_launch.luxury_blueprint.line_overlay.architectural_plate.v1": "20. Luxury Blueprint Architecture Plate.png",
  "project_launch.minimal.symbolic_centerpiece.centered_symmetry.v1": "21. Minimal Symbolic Launch.png",
  "project_launch.museum_label.hero_crop.exhibition_poster.v1": "22. Museum Label Launch Poster.png",
  "project_launch.quiet_luxury.facade_crop.centered_symmetry.v1": "23. Quiet Luxury Facade Reveal.png",
  "project_launch.retro.cutout_hero.blob_cutout.v1": "24. Retro Cutout Launch.png",
  "project_launch.swiss_grid.facade_crop.left_copy_right_hero.v1": "25. Swiss Grid Launch Split.png",
  "site_visit.editorial_catalog.facade_crop.magazine_spread.v1": "26. Editorial Site Visit.png",
  "site_visit.graphic_led.proposition_box.card_stack.v1": "27. Graphic Visit CTA Card.png",
  "site_visit.swiss_grid.facade_crop.swiss_grid.v1": "28. Swiss Visit Planner.png",
};

const TEMPLATES_DIR = "/Users/shilpakambale/Desktop/Projects/Mar-26/Social Media/templates images";

const BUCKET = "creative-assets";
const STORAGE_BASE = `templates/preview`;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function uploadFile(filePath, storagePath) {
  const buffer = fs.readFileSync(filePath);
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
    upsert: true,
    contentType: "image/png"
  });
  if (error) throw error;
}

async function updateDbRecord(templateKey, storagePath) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ preview_storage_path: storagePath });
    const url = new URL(`${SUPABASE_URL}/rest/v1/creative_v3_visual_template_catalog`);
    url.searchParams.set("template_key", `eq.${templateKey}`);

    const options = {
      hostname: url.hostname,
      path: url.pathname + "?" + url.searchParams.toString(),
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "apikey": SERVICE_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      }
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve();
        else reject(new Error(`HTTP ${res.statusCode}: ${data}`));
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log("Uploading to creative-assets bucket...\n");
  const errors = [];
  const results = [];

  for (const [templateKey, fileName] of Object.entries(TEMPLATE_IMAGE_MAP)) {
    const filePath = path.join(TEMPLATES_DIR, fileName);
    const storagePath = `${STORAGE_BASE}/${templateKey}.png`;

    process.stdout.write(`Uploading ${fileName}... `);

    if (!fs.existsSync(filePath)) {
      console.log(`❌ FILE NOT FOUND`);
      errors.push({ templateKey, fileName, error: "File not found" });
      continue;
    }

    try {
      await uploadFile(filePath, storagePath);
      await updateDbRecord(templateKey, storagePath);
      results.push({ templateKey, storagePath });
      console.log(`✅`);
    } catch (err) {
      console.log(`❌ ${err.message.split("\n")[0]}`);
      errors.push({ templateKey, fileName, error: err.message });
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Uploaded: ${results.length}/28`);
  console.log(`Failed: ${errors.length}/28`);
  if (errors.length > 0) {
    errors.forEach(e => console.log(`  ${e.templateKey}: ${e.error.split("\n")[0]}`));
  }
}

main().catch(console.error);