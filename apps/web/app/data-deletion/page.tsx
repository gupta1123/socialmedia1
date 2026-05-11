import type { Metadata } from "next";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = {
  title: "Data Deletion | Briefly Social",
  description: "Instructions for requesting deletion of Briefly Social and connected Facebook or Instagram data."
};

export default function DataDeletionPage() {
  return (
    <LegalPage
      eyebrow="Data Deletion"
      title="Request deletion of your Briefly Social data"
      updated="May 11, 2026"
      intro="Use this page to request removal of workspace data and connected Facebook or Instagram account data handled by Briefly Social."
    >
      <section>
        <h2>How to request deletion</h2>
        <p>
          Email <a href="mailto:solutionnyx@gmail.com">solutionnyx@gmail.com</a> with the subject
          line "Briefly Social Data Deletion Request". Include the email address you use to sign in,
          the workspace or brand name, and the Facebook Page or Instagram account you want disconnected
          or deleted from Briefly Social.
        </p>
      </section>

      <section>
        <h2>What we delete or disconnect</h2>
        <p>
          After verifying account ownership or workspace authorization, we will remove or disable stored
          access tokens, disconnect the requested social accounts, and delete personal or workspace data
          that is no longer required to provide the service or meet legal and security obligations.
        </p>
      </section>

      <section>
        <h2>Timing</h2>
        <p>
          We aim to process valid deletion requests within 30 days. Some limited records may remain in
          backups, security logs, billing records, or legal records for a reasonable period where required
          for compliance, fraud prevention, dispute resolution, or service security.
        </p>
      </section>

      <section>
        <h2>Facebook and Instagram removal</h2>
        <p>
          You can also remove Briefly Social from your Facebook or Instagram settings. When access is
          removed through Meta, Briefly Social will no longer be able to publish, schedule, or retrieve
          account information for that connection.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          For deletion status or questions, contact{" "}
          <a href="mailto:solutionnyx@gmail.com">solutionnyx@gmail.com</a>.
        </p>
      </section>
    </LegalPage>
  );
}
