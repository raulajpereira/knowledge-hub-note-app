'use client';

import { MgAlloc } from './MgAlloc';
import { MgClients } from './MgClients';
import { MgDash } from './MgDash';
import { MgOverview } from './MgOverview';
import { MgPeople } from './MgPeople';
import { MgProjects } from './MgProjects';
import { MgSkills } from './MgSkills';
import { MgStaff } from './MgStaff';
import { MgTeams } from './MgTeams';
import { MgTime } from './MgTime';
import { MgProvider, useMg, type Mg } from './store';
import { TeamBar } from './ui';
import './mg.css';

const PAGES: Record<string, (p: { mg: Mg }) => React.ReactNode> = {
  mg_overview: MgOverview,
  mg_dash: MgDash,
  mg_projects: MgProjects,
  mg_alloc: MgAlloc,
  mg_staff: MgStaff,
  mg_time: MgTime,
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
