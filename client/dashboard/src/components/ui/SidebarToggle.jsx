import React from 'react';
import styled from 'styled-components';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const SidebarToggle = ({ checked, onChange, isDark, className, style }) => {
  return (
    <StyledWrapper isDark={isDark} className={className} style={style}>
      <motion.button
        type="button"
        className="toggle-button"
        onClick={() => onChange(!checked)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        title={checked ? "Collapse Sidebar" : "Expand Sidebar"}
      >
        <div className="icon-container">
          <AnimatePresence mode="wait">
            {checked ? (
              <motion.div
                key="close"
                initial={{ opacity: 0, rotate: -90 }}
                animate={{ opacity: 1, rotate: 0 }}
                exit={{ opacity: 0, rotate: 90 }}
                transition={{ duration: 0.2 }}
              >
                <PanelLeftClose size={20} />
              </motion.div>
            ) : (
              <motion.div
                key="open"
                initial={{ opacity: 0, rotate: 90 }}
                animate={{ opacity: 1, rotate: 0 }}
                exit={{ opacity: 0, rotate: -90 }}
                transition={{ duration: 0.2 }}
              >
                <PanelLeftOpen size={20} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.button>
    </StyledWrapper>
  );
};

const StyledWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1300; /* Higher than sidebar */

  .toggle-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    border: 1px solid ${props => props.isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)'};
    background: ${props => props.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.8)'};
    backdrop-filter: blur(8px);
    color: ${props => props.isDark ? '#fff' : '#000'};
    cursor: pointer;
    transition: all 0.3s ease;
    padding: 0;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);

    &:hover {
      background: ${props => props.isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.95)'};
      border-color: ${props => props.isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)'};
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
    }
  }

  .icon-container {
    display: flex;
    align-items: center;
    justify-content: center;
  }
`;

export default SidebarToggle;
