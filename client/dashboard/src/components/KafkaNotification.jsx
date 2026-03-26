import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, X, Bell } from 'lucide-react';

const SOCKET_URL = 'http://localhost:3006'; // Direct connection to analytics-service

const KafkaNotification = () => {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    const socket = io(SOCKET_URL);

    socket.on('connect', () => {
      console.log('Connected to Kafka WebSocket');
    });

    socket.on('kafka-message', (data) => {
      console.log('New Kafka message via socket:', data);
      const newMessage = {
        id: Date.now() + Math.random(),
        ...data,
        receivedAt: new Date().toLocaleTimeString()
      };
      
      setMessages(prev => [newMessage, ...prev].slice(0, 3)); // Keep last 3 messages
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const removeMessage = (id) => {
    setMessages(prev => prev.filter(m => m.id !== id));
  };

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-full max-w-lg px-4 space-y-2 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
            layout
            className="pointer-events-auto bg-black/80 backdrop-blur-md border border-brand-500/30 text-white rounded-xl shadow-2xl overflow-hidden"
          >
            <div className="px-4 py-3 flex items-center justify-between border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-brand-500/20 flex items-center justify-center">
                  <Terminal className="w-4 h-4 text-brand-400" />
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-brand-400">Kafka Message</h4>
                  <p className="text-[10px] text-white/50">{msg.receivedAt} • Topic: {msg.topic}</p>
                </div>
              </div>
              <button 
                onClick={() => removeMessage(msg.id)}
                className="p-1 hover:bg-white/10 rounded-md transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4 text-white/40" />
              </button>
            </div>
            
            <div className="p-4 space-y-2">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-medium text-white/30 uppercase">Key</span>
                <code className="text-xs break-all bg-white/5 p-1 rounded border border-white/5">{msg.key || 'null'}</code>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-medium text-white/30 uppercase">Value</span>
                <code className="text-xs break-all bg-white/5 p-1 rounded border border-white/5 block whitespace-pre-wrap">
                  {msg.value && msg.value.length > 200 ? msg.value.substring(0, 200) + '...' : msg.value}
                </code>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default KafkaNotification;
