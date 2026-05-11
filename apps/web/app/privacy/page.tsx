import type { Metadata } from "next";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy | Briefly Social",
  description: "Privacy policy for Briefly Social, including Facebook and Instagram account data handling."
};

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Privacy Policy"
      title="How Briefly Social handles workspace and social account data"
      updated="May 11, 2026"
      intro="Briefly Social is a content planning, creation, scheduling, and publishing product for teams that manage brand social media."
    >
      <section>
        <h2>Information we collect</h2>
        <p>
          We collect account details needed to operate the product, including user email addresses,
          workspace membership, brand settings, project details, uploaded assets, generated creative
          content, captions, approvals, and scheduled publication data.
        </p>
        <p>
          If you connect Facebook or Instagram, we may receive the account identifiers, profile names,
          Facebook Pages, Instagram professional accounts, granted permissions, access tokens, publishing
          status, and related metadata needed to publish or schedule content for accounts you authorize.
        </p>
      </section>

      <section>
        <h2>How we use information</h2>
        <p>
          We use this information to authenticate users, manage workspaces, generate and organize social
          content, connect authorized social accounts, publish or schedule posts at your direction, provide
          support, prevent misuse, and improve product reliability.
        </p>
        <p>
          We do not sell Facebook, Instagram, or workspace data. We do not publish to your connected
          accounts unless an authorized user creates, approves, or schedules that action inside Briefly
          Social.
        </p>
      </section>

      <section>
        <h2>Facebook and Instagram data</h2>
        <p>
          Facebook and Instagram permissions are used only for the features the connected workspace
          enables, such as listing available Pages and Instagram professional accounts, preparing posts,
          publishing approved content, and later showing post performance where permission has been
          granted.
        </p>
        <p>
          Access tokens are treated as confidential credentials. They are stored only for product
          operation, are not exposed to public clients, and are removed or disabled when a connected
          account is disconnected or deleted.
        </p>
      </section>

      <section>
        <h2>Sharing and processors</h2>
        <p>
          We may share data with infrastructure, hosting, authentication, storage, analytics, and support
          providers that help us operate Briefly Social. We may also disclose information when required by
          law, to protect users, or to investigate misuse of the product.
        </p>
      </section>

      <section>
        <h2>Retention and deletion</h2>
        <p>
          We retain data while it is needed to provide the service, meet legal obligations, resolve
          disputes, and maintain business records. Workspace owners or authorized users can request data
          deletion through the data deletion page or by contacting us.
        </p>
        <p>
          To request deletion, visit the data deletion page or email{" "}
          <a href="mailto:solutionnyx@gmail.com">solutionnyx@gmail.com</a>.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          For privacy questions, account access requests, or deletion requests, contact{" "}
          <a href="mailto:solutionnyx@gmail.com">solutionnyx@gmail.com</a>.
        </p>
      </section>
    </LegalPage>
  );
}
