import { DATA_STORAGE_FIRST_SENTENCE, RESEARCHERS, RESEARCHER_EMAILS } from '@/lib/consent';

const H = ({ children }: { children: React.ReactNode }) => (
  <h3 className="mt-6 mb-2 text-[13px] font-bold uppercase tracking-wide text-gf-text">{children}</h3>
);
const P = ({ children }: { children: React.ReactNode }) => <p className="mb-3">{children}</p>;

export default function ConsentText({ studyLocation }: { studyLocation?: string }) {
  return (
    <div className="text-[14px] leading-6 text-gf-text">
      <h2 className="text-[16px] font-bold mb-3">Informed Consent Script</h2>

      <P>
        <b>Name and title of Researchers:</b>
        <br />
        {RESEARCHERS}
      </P>
      <P>
        <b>Department/Room Number:</b>
        <br />
        Department of Psychology / Room no. AC04 302.
      </P>
      <P>
        <b>Telephone Number:</b>
        <br />
        9971228718.
      </P>
      <P>
        <b>Email:</b>
      </P>
      <ul className="list-disc pl-6 mb-3">
        {RESEARCHER_EMAILS.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
      {studyLocation ? (
        <P>
          <b>Study Location(s):</b>
          <br />
          {studyLocation}
        </P>
      ) : null}

      <H>Purpose of study</H>
      <P>
        This research is designed to explore the psychology of decision-making and cognitive biases, as affected by the
        external factor of crowd versus brown noise.
      </P>

      <H>Participants</H>
      <P>
        <i>Inclusion/Exclusion Criteria</i>
      </P>
      <P>You are eligible to participate in this study if you are at least 18 years of age or older.</P>
      <P>
        You are ineligible to participate in this study if you are not an undergraduate student at Ashoka University, if
        you are hearing or vision impaired, or if you are not fluent in the English language.
      </P>
      <P>
        <i>Approximate Number of Participants</i>
      </P>
      <P>The approximate number of people who will participate in this study is 40.</P>

      <H>Procedures</H>
      <P>
        The following procedures will occur. The experiment is expected to take 10–15 minutes. Participants will be tested
        individually in a dedicated testing room, with the same setup and instructions across all sessions.
      </P>
      <P>
        Eligible participants will read instructions and provide informed consent. Each participant will be randomly
        assigned to one of four conditions by an automated randomizer.
      </P>
      <P>
        Participants will be told only that the study examines decision-making. They will not be told the hypothesis or
        that sound and wording are being varied.
      </P>
      <P>
        The assigned audio track will begin in each participant’s headphones before the vignette appears and will play
        continuously until the participant submits a decision.
      </P>
      <P>
        The sound will be played through the same device for all participants at a standardized, researcher-configured,
        ethically approved volume.
      </P>
      <P>
        When ready, the participant will begin the task. The screen will then display the standardized baseline context,
        followed by the frame-specific sentence (gain or loss) and the question:
      </P>
      <P>“Will you share this technique?”</P>
      <P>The two response options will be:</P>
      <ul className="list-disc pl-6 mb-3">
        <li>Yes, share.</li>
        <li>No, keep private.</li>
      </ul>
      <P>
        Decision latency will be recorded automatically from the moment the vignette is first displayed to the moment the
        participant submits a response.
      </P>
      <P>
        Participants will be told to read the scenario carefully and respond as they naturally would, with no right or
        wrong answer.
      </P>
      <P>The time at which the decision is submitted, and the decision itself, will be stored for analysis.</P>
      <P>After submitting a decision, the audio will stop.</P>
      <P>
        Participants will be debriefed verbally. They will be told that the scenario was hypothetical, that the background
        sound and wording of the dilemma were varied on purpose to test their effect on decision time, and that the data
        will be anonymous.
      </P>
      <P>Participants will have the chance to ask questions or withdraw their data.</P>

      <H>Risks and discomforts</H>
      <P>
        A few foreseeable risks include the discomfort a participant may face when hearing dynamic crowd noise in
        headphones. The same may be true for brown noise. Some participants may experience sensory discomfort or
        sound-related irritation.
      </P>
      <P>
        The research team should ensure that playback volume is set at a safe, standardized level, and that participants
        can stop the audio or withdraw if uncomfortable. Do not assume that a particular volume is harmless without
        appropriate assessment and ethics approval.
      </P>

      <H>Benefits</H>
      <P>Benefits to the participants include contributing to beneficial psychological research.</P>
      <P>
        Decision-making in a country as overpopulated and overcrowded as ours is bound to be impacted by noise levels, and
        therefore researching the impact of external stressors on it could aid cognitive research development overall and
        help change attitudes towards making decisions.
      </P>

      <H>Compensation</H>
      <P>N/A.</P>

      <H>Confidentiality</H>
      <P>All information obtained in this study is strictly confidential unless disclosure is required by law.</P>
      <P>
        In addition, the Human Research Ethics Board, the sponsor of the study, and University or government officials
        responsible for monitoring this study may inspect these records.
      </P>
      <P>
        Data will be recorded anonymously, which means no one, including the research team, can identify you from the study
        data.
      </P>

      <H>Data storage</H>
      <P>
        {DATA_STORAGE_FIRST_SENTENCE} The time taken to answer the questions will be stored temporarily until complete data
        collection and data analysis are completed.
      </P>
      <P>
        Taking the entire research process (including the time associated with academic publishing), the deidentified data
        will remain in this web-based space for seven years. At that point, the data will be deleted.
      </P>

      <H>If you have questions</H>
      <P>
        If you have any comments, concerns, or questions regarding the conduct of this research, please contact the
        researchers:
      </P>
      <ul className="list-disc pl-6 mb-3">
        {RESEARCHER_EMAILS.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
      <P>
        For questions about your rights as a research participant, contact Ashoka University Human Research Ethics
        Committee (AUHREC), which is a group of people who review the research to protect your rights, at
        auhrec@ashoka.edu.in.
      </P>
    </div>
  );
}
