import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api.js';

const AgentsContext = createContext(null);

export function AgentsProvider({ children }) {
  const [agents, setAgents] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const { agents } = await api.listAgents();
    setAgents(agents);
    setLoaded(true);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createAgent = async (payload) => {
    const { agent } = await api.createAgent(payload);
    setAgents((prev) => [...prev, agent]);
    return agent;
  };

  const updateAgent = async (id, payload) => {
    const { agent } = await api.updateAgent(id, payload);
    setAgents((prev) => prev.map((a) => (a.id === id ? agent : a)));
    return agent;
  };

  const deleteAgent = async (id) => {
    await api.deleteAgent(id);
    setAgents((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <AgentsContext.Provider value={{ agents, loaded, refresh, createAgent, updateAgent, deleteAgent }}>
      {children}
    </AgentsContext.Provider>
  );
}

export function useAgents() {
  const ctx = useContext(AgentsContext);
  if (!ctx) throw new Error('useAgents must be used within AgentsProvider');
  return ctx;
}
