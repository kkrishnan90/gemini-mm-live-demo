import React from 'react';
import './App.css';
import { useSession } from './hooks/useSession';
import { ConsolePanel } from './components/ConsolePanel';
import { MainPanel } from './components/MainPanel';
import { ControlBar } from './components/ControlBar';

const App = () => {
  const session = useSession();

  return (
    <div className="app-container">
      <ConsolePanel {...session} />
      <MainPanel {...session} />
      <ControlBar {...session} />
    </div>
  );
};

export default App;