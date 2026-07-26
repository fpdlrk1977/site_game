import { LegalPage, Section, Bullets } from '../LegalPage';
import { SITE_INFO } from '@/lib/siteInfo';

export const metadata = { title: 'Terms of Service — Park3D', description: 'The rules for using Park3D.' };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={`These terms govern your use of ${SITE_INFO.serviceName} (the "Service"). By creating an account or using the Service, you agree to them.`}
    >
      <Section n={1} title="The Service">
        <p>
          {SITE_INFO.serviceName} lets you build interactive 3D spaces in a browser-based editor and publish them
          to a public link, an embedded page, or your own domain. Features may change, and some are limited by plan.
        </p>
      </Section>

      <Section n={2} title="Your account">
        <Bullets items={[
          'You are responsible for keeping your login credentials secure and for everything done under your account.',
          'You must be legally able to enter into a contract in your jurisdiction.',
          'One person or organization per account; do not share accounts to circumvent plan limits.',
          'We may suspend an account that is used to break these terms or the law.',
        ]} />
      </Section>

      <Section n={3} title="Your content">
        <p>
          You keep ownership of everything you upload or create — models, textures, audio, scenes, and published
          spaces. You grant us only the licence we need to run the Service: to store, process, and transmit your
          content so it can be displayed to you and to the people you publish to.
        </p>
        <p>
          If you make a project public, you additionally allow other users to view it and, where the remix feature
          is enabled, to copy it into their own account as a starting point. You can make a project private at any
          time; copies already made by others remain theirs.
        </p>
      </Section>

      <Section n={4} title="What you may not upload">
        <Bullets items={[
          'Content you do not have the rights to distribute, including licensed 3D assets used outside their licence.',
          'Malware, or content designed to phish, deceive, or harvest credentials.',
          'Content that is unlawful, that harasses or endangers others, or that sexualizes minors.',
          'Content that impersonates a real person or organization in a misleading way.',
        ]} />
        <p>We may remove content that breaks these rules, and will tell you when we do unless the law prevents it.</p>
      </Section>

      <Section n={5} title="Plans, limits and billing">
        <p>
          Free and paid plans differ in storage, project count, custom domains, analytics, and other features.
          Paid billing is not yet available; when it launches, prices, renewal terms, and refund conditions will be
          stated at checkout and here before any charge is made. Until then all listed prices are provisional.
        </p>
      </Section>

      <Section n={6} title="Availability">
        <p>
          We aim to keep the Service running, but it is provided &ldquo;as is&rdquo; without a guaranteed uptime level.
          We may perform maintenance, change features, or discontinue parts of the Service. For a discontinuation
          that materially affects you, we will give reasonable notice and a way to export your work.
        </p>
      </Section>

      <Section n={7} title="Liability">
        <p>
          To the extent permitted by law, we are not liable for indirect or consequential losses, lost profits, or
          lost data. Nothing here limits liability that cannot be limited by law, including for death, personal
          injury, or our own intentional misconduct or gross negligence.
        </p>
        <p>
          <b className="font-semibold">Keep your own backups</b> of important source assets. You can export scenes
          and models from the editor at any time.
        </p>
      </Section>

      <Section n={8} title="Ending the agreement">
        <p>
          You may delete your projects or stop using the Service at any time. If you ask us to delete your account,
          we will remove your projects and assets as described in the Privacy Policy. We may terminate an account
          for a serious or repeated breach of these terms.
        </p>
      </Section>

      <Section n={9} title="Changes to these terms">
        <p>
          We will post any change here and update the date at the top. If a change materially reduces your rights,
          we will give notice before it takes effect. Continuing to use the Service after that means you accept the
          updated terms.
        </p>
      </Section>

      <Section n={10} title="Contact">
        <p>
          Questions about these terms: <a className="text-primary hover:underline" href={`mailto:${SITE_INFO.supportEmail}`}>{SITE_INFO.supportEmail}</a>
        </p>
      </Section>
    </LegalPage>
  );
}
