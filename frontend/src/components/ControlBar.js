import React from 'react';
import { ActionControls } from './ActionControls';
import { StatusIndicators } from './StatusIndicators';

export const ControlBar = (props) => {
  return (
    <div className="control-bar">
      <ActionControls {...props} />
      <StatusIndicators {...props} />
    </div>
  );
};