import type { Metadata } from "next";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = {
  title: "Terms of Service | Briefly Social",
  description: "Terms of service for Briefly Social users and workspaces."
};

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Terms of Service"
      title="Terms for using Briefly Social"
      updated="May 11, 2026"
      intro="These terms govern access to Briefly Social and use of its content creation, workflow, scheduling, and publishing features."
    >
      <section>
        <h2>Use of the service</h2>
        <p>
          You may use Briefly Social only for lawful business purposes and only for workspaces, brands,
          assets, and social accounts that you are authorized to manage. You are responsible for keeping
          your account secure and for activity performed through your workspace.
        </p>
      </section>

      <section>
        <h2>Connected social accounts</h2>
        <p>
          When you connect Facebook, Instagram, or another third-party account, you confirm that you have
          permission to grant Briefly Social access to that account. You are responsible for following the
          third-party platform rules, advertising policies, intellectual property rules, and community
          standards that apply to your content.
        </p>
      </section>

      <section>
        <h2>Content and approvals</h2>
        <p>
          You retain responsibility for content, captions, claims, images, videos, links, and campaign
          settings created, uploaded, approved, scheduled, or published through Briefly Social. AI-assisted
          drafts and generated creative must be reviewed before use, especially for regulated industries,
          pricing, legal claims, RERA disclosures, offers, or advertising copy.
        </p>
      </section>

      <section>
        <h2>Prohibited use</h2>
        <p>
          You may not use Briefly Social to violate law, impersonate others, publish deceptive content,
          distribute malware, infringe intellectual property, attempt unauthorized access, overload the
          service, bypass product limits, or misuse connected social platform permissions.
        </p>
      </section>

      <section>
        <h2>Availability and changes</h2>
        <p>
          Briefly Social depends on hosting providers, authentication providers, AI systems, and social
          platform APIs. Features may change, pause, or fail when third-party services, permissions, review
          status, or platform rules change.
        </p>
      </section>

      <section>
        <h2>Disclaimers and liability</h2>
        <p>
          Briefly Social is provided as a software tool. We do not guarantee uninterrupted operation,
          specific publishing outcomes, platform approval, ad performance, lead volume, or business
          results. To the maximum extent permitted by law, liability is limited to the amount paid for the
          service during the period giving rise to the claim.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          For questions about these terms, contact{" "}
          <a href="mailto:solutionnyx@gmail.com">solutionnyx@gmail.com</a>.
        </p>
      </section>
    </LegalPage>
  );
}
