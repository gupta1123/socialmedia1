import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://xuvecgnuphvzjxtowqem.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY env var");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
});

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

async function uploadTemplateImages() {
  const errors = [];
  const updates = [];

  for (const [templateKey, fileName] of Object.entries(TEMPLATE_IMAGE_MAP)) {
    const filePath = `${TEMPLATES_DIR}/${fileName}`;
    const storagePath = `templates/${templateKey}.png`;

    try {
      const fileBuffer = await Bun.file(filePath).arrayBuffer();
      const buffer = Buffer.from(fileBuffer);

      const { error: uploadError } = await supabase.storage
        .from("template-images")
        .upload(storagePath, buffer, {
          contentType: "image/png",
          upsert: true
        });

      if (uploadError) {
        console.error(`❌ Upload failed for ${fileName}: ${uploadError.message}`);
        errors.push({ fileName, error: uploadError.message });
        continue;
      }

      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/template-images/${storagePath}`;
      updates.push({ templateKey, publicUrl, storagePath });
      console.log(`✅ Uploaded: ${fileName}`);
    } catch (err) {
      console.error(`❌ Error processing ${fileName}: ${err.message}`);
      errors.push({ fileName, error: err.message });
    }
  }

  console.log(`\n--- Upload Summary ---`);
  console.log(`Uploaded: ${updates.length}/28`);
  console.log(`Errors: ${errors.length}`);

  // Update DB with public URLs
  console.log(`\n--- Updating DB ---`);
  for (const { templateKey, publicUrl } of updates) {
    const { error: updateError } = await supabase
      .from("creative_v3_visual_template_catalog")
      .update({ preview_image_url: publicUrl })
      .eq("template_key", templateKey);

    if (updateError) {
      console.error(`❌ DB update failed for ${templateKey}: ${updateError.message}`);
    } else {
      console.log(`✅ DB updated: ${templateKey}`);
    }
  }

  if (errors.length > 0) {
    console.log(`\n--- Failed Files ---`);
    errors.forEach(e => console.log(`  ${e.fileName}: ${e.error}`));
  }
}

uploadTemplateImages().catch(console.error);