import { LegalPage, Section, Bullets } from '../LegalPage';
import { SITE_INFO } from '@/lib/siteInfo';

export const metadata = { title: 'Privacy Policy — Park3D', description: 'What Park3D collects, why, and how long it is kept.' };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={`This describes exactly what ${SITE_INFO.serviceName} collects, why, and how long we keep it. It reflects what the product actually does today — not a generic template of what a service might do.`}
    >
      <Section n={1} title="What we collect">
        <p><b className="font-semibold">Account.</b> Your email address, and an authentication record held by our
          database provider. Passwords are never stored by us in readable form.</p>
        <p><b className="font-semibold">Profile.</b> A username generated from your email at sign-up, plus any display
          name, avatar, or bio you add. Profile pages are public.</p>
        <p><b className="font-semibold">Your content.</b> Projects, scenes, uploaded models, textures, and audio.</p>
        <p><b className="font-semibold">Community activity.</b> Likes, comments, follows, and whether a project was
          remixed from another. These are visible to other users.</p>
        <p><b className="font-semibold">Usage of published spaces.</b> When someone opens a published space we record
          the event type (view, click, area trigger), which scene it belongs to, the name of the object interacted
          with, and a timestamp. <b className="font-semibold">We do not record the visitor&apos;s IP address, browser
          fingerprint, account, or any identifier</b> — these rows cannot be traced back to an individual visitor.
        </p>
      </Section>

      <Section n={2} title="What we do not do">
        <Bullets items={[
          'No advertising, and no sale or sharing of personal data with advertisers or data brokers.',
          'No third-party tracking or analytics scripts on published spaces.',
          'No profiling of visitors to your published spaces.',
        ]} />
      </Section>

      <Section n={3} title="Cookies and local storage">
        <p>
          We use a session cookie to keep you signed in — it is required for the Service to function and is not used
          for tracking. Your browser also stores small preferences locally (theme, editor settings, whether you
          dismissed the onboarding checklist) and, for published games, any saved game variables the creator marked
          as persistent. These stay on your device and are never sent to us.
        </p>
      </Section>

      <Section n={4} title="Where your data is stored">
        <p>
          Account data, project data, and uploaded files are stored with our database and storage provider
          (Supabase). Uploaded assets are served from a <b className="font-semibold">public storage bucket</b>: anyone
          who has the direct file URL can download that file, even if the project itself is private. Do not upload
          material that must remain confidential.
        </p>
      </Section>

      <Section n={5} title="Who can see what">
        <Bullets items={[
          'Private projects: only you (and, if you invite someone to a collaborative editing session, the people who have that editor link).',
          'Published projects: anyone with the link, plus everyone browsing the community gallery.',
          'Profile, likes, comments, follows: public.',
          'Usage statistics for your spaces: only you (Analytics), enforced at the database level.',
        ]} />
      </Section>

      <Section n={6} title="How long we keep it">
        <Bullets items={[
          'Account, profile, and content: until you delete them or ask us to delete your account.',
          'Usage events: retained to power your analytics; we do not need them beyond that and they contain no personal identifiers.',
          'Backups may retain deleted data for a short period before being overwritten.',
        ]} />
      </Section>

      <Section n={7} title="Your choices">
        <Bullets items={[
          'Edit or delete any project at any time from the dashboard.',
          'Make a published project private again — it leaves the gallery immediately.',
          'Export your scenes and models as .glb from the editor.',
          'Request account deletion by email; we will confirm and remove your account, projects, and uploaded files.',
        ]} />
        <p>
          Depending on where you live you may also have rights to access, correct, or port your data, or to object to
          processing. Write to us and we will help.
        </p>
      </Section>

      <Section n={8} title="Children">
        <p>The Service is not directed at children under the age required for consent in their country.</p>
      </Section>

      <Section n={9} title="Changes">
        <p>
          If this policy changes we will update it here and change the date at the top. Material changes affecting
          how we use existing data will be announced before they take effect.
        </p>
      </Section>

      <Section n={10} title="Contact">
        <p>
          Privacy questions or deletion requests: <a className="text-primary hover:underline" href={`mailto:${SITE_INFO.supportEmail}`}>{SITE_INFO.supportEmail}</a>
        </p>
      </Section>
    </LegalPage>
  );
}
