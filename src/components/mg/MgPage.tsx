'use client';

import { MgClients } from './MgClients';
import { MgPeople } from './MgPeople';
import { MgSkills } from './MgSkills';
import { MgTeams } from './MgTeams';
import { MgProvider, useMg, type Mg } from './store';
import { TeamBar } from './ui';
import './mg.css';

const PAGES: Record<string, (p: { mg: Mg }) => React.ReactNode> = {
  mg_clients: MgClients,
  mg_people: MgPeople,
  mg_teams: MgTeams,
  mg_skills: MgSkills,
};

function Body({ page }: { page: string }) {
  const mg = useMg();
  const P = PAGES[page]!;
  return (
    <>
      {page !== 'mg_clients' && page !== 'mg_teams' && <TeamBar mg={mg} />}
      <P mg={mg} />
    </>
  );
}

/** One Management screen: the shared data set, the team bar and the page. */
export function MgPage({ page }: { page: keyof typeof PAGES & string }) {
  return (
    <div className="mg-page" data-mg={page}>
      <MgProvider>
        <Body page={page} />
      </MgProvider>
    </div>
  );
}
