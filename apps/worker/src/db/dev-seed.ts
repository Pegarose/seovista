import { createDbClient } from "./client.js";
import { createAdminAuthRepository } from "./admin-auth.js";
import { createCmsRepository } from "./cms-repository.js";
import { createGeoAuditRepository } from "./geo-audit-repository.js";

async function main() {
  const connectionString = 
    process.env.DATABASE_URL || "postgresql://seovista:seovista@127.0.0.1:8543/seovista";

  console.log(`Connecting to database at ${connectionString}...`);
  const dbClient = createDbClient({ connectionString });

  try {
    // 1. connection check
    await dbClient.query("SELECT 1");
    console.log("Database connection successful.");

    const adminRepo = createAdminAuthRepository(dbClient);
    const cmsRepo = createCmsRepository(dbClient);
    const geoRepo = createGeoAuditRepository(dbClient);

    // 4. Admin
    const adminEmail = "admin@seovista.example";
    const existingAdmin = await adminRepo.findUserByEmail(adminEmail);
    if (!existingAdmin) {
      await adminRepo.createUser({
        email: adminEmail,
        displayName: "Admin",
        passwordHash: "admin123", // Assuming fake unhashed for dev seeding based on requirements
        status: "active"
      });
      console.log(`Inserted admin: ${adminEmail}`);
    } else {
      console.log(`Admin ${adminEmail} already exists. Skipping.`);
    }

    // 5. Insights - checking existence by slug
    const insights = [
      {
        title: "The Mechanics of AI Visibility",
        slug: "mechanics-of-ai-visibility",
        blocks: [{ type: "paragraph", data: { text: "AI visibility relies on structured and verifiable data citations..." } }]
      },
      {
        title: "Citations as Currency in 2026",
        slug: "citations-as-currency-2026",
        blocks: [{ type: "paragraph", data: { text: "By 2026, raw backlink volume fades in favor of deep contextual citations from trusted LLM data sources." } }]
      }
    ];

    for (const insight of insights) {
      const existing = await dbClient.query("SELECT id FROM cms_entries WHERE slug = $1 AND collection_name = 'articles'", [insight.slug]);
      if (existing.rowCount === 0) {
        const entry = await cmsRepo.createEntry({
          organization_id: '00000000-0000-0000-0000-000000000000', // fallback org
          collection_name: 'articles',
          slug: insight.slug,
          locale: 'en',
          current_revision_id: null,
          published_revision_id: null
        });

        const revision = await cmsRepo.saveRevision({
          entry_id: entry.id,
          revision_number: 1,
          schema_version: '1.0.0',
          content: {
            title: insight.title,
            body: insight.blocks
          },
          content_checksum: 'dev-seed-checksum',
          created_by: 'dev-seed'
        });

        await cmsRepo.updatePublicationState(entry.id, 'published', revision.id);
        console.log(`Inserted published insight: ${insight.slug}`);
      } else {
        console.log(`Insight ${insight.slug} already exists. Skipping.`);
      }
    }

    // 6. Leads
    const existingLeads = await geoRepo.getAllLeadsForAdmin();
    
    // Finished Lead
    if (!existingLeads.some(l => l.domain === 'completed-lead.local')) {
      const finishedLead = await geoRepo.createLead({
        domain: "completed-lead.local",
        brandName: "Completed Brand",
        primaryMarket: "US"
      });
      await geoRepo.updateLeadEmail(finishedLead.id, "lead@completed-lead.local", true);
      console.log(`Inserted finished lead: ${finishedLead.domain}`);
    } else {
      console.log(`Finished lead completed-lead.local already exists. Skipping.`);
    }

    // Abandoned Halfway Lead
    if (!existingLeads.some(l => l.domain === 'abandoned-lead.local')) {
      const abandonedLead = await geoRepo.createLead({
        domain: "abandoned-lead.local",
        brandName: "Abandoned Brand",
        primaryMarket: "US"
      });
      // No email update
      console.log(`Inserted abandoned lead: ${abandonedLead.domain}`);
    } else {
       console.log(`Abandoned lead abandoned-lead.local already exists. Skipping.`);
    }

    console.log("Seeding complete.");

  } catch (err) {
    console.error("Seeding failed:", err);
  } finally {
    await dbClient.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

export { main };
