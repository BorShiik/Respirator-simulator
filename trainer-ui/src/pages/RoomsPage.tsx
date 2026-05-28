import React, { useState, useEffect } from 'react';
import { Room } from '../types/trainer';
import trainerApi from '../api/trainerApi';
import { ConfirmModal } from '../components/ui/Modal';

export function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [newRoomName, setNewRoomName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [closeRoomConfirm, setCloseRoomConfirm] = useState<{ open: boolean; roomId: string | null }>({ open: false, roomId: null });

  useEffect(() => {
    loadRooms();
  }, []);

  const loadRooms = async () => {
    try {
      const data = await trainerApi.getRooms();
      setRooms(data);
    } catch (error) {
      console.error('Failed to load rooms:', error);
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;

    setIsLoading(true);
    try {
      await trainerApi.createRoom(newRoomName);
      setNewRoomName('');
      await loadRooms();
    } catch (error) {
      console.error('Failed to create room:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseRoom = (roomId: string) => {
    setCloseRoomConfirm({ open: true, roomId });
  };

  const confirmCloseRoom = async () => {
    const roomId = closeRoomConfirm.roomId;
    if (!roomId) return;
    
    try {
      await trainerApi.closeRoom(roomId);
      await loadRooms();
    } catch (error) {
      console.error('Failed to close room:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Sale Egzaminacyjne (Pokoje)</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Twórz pokoje dla studentów, aby grupować ich sesje testowe.
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Utwórz nowy pokój</h2>
        <form onSubmit={handleCreateRoom} className="flex gap-4">
          <input
            type="text"
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value)}
            placeholder="Nazwa pokoju (np. Grupa 1 - Egzamin końcowy)"
            className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            required
          />
          <button
            type="submit"
            disabled={isLoading || !newRoomName.trim()}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {isLoading ? 'Tworzenie...' : 'Utwórz'}
          </button>
        </form>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow overflow-hidden sm:rounded-md">
        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
          {rooms.map((room) => (
            <li key={room.id}>
              <div className="px-4 py-4 sm:px-6 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400 truncate">
                    {room.name}
                  </p>
                  <p className="mt-1 flex items-center text-sm text-gray-500 dark:text-gray-400">
                    Kod: <span className="ml-2 font-mono text-lg font-bold text-gray-900 dark:text-white tracking-widest">{room.code}</span>
                  </p>
                  <p className="mt-1 flex items-center text-xs text-gray-400">
                    Utworzono: {new Date(room.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="ml-4 flex-shrink-0 flex items-center gap-4">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    room.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {room.isActive ? 'Aktywny' : 'Zamknięty'}
                  </span>
                  {room.isActive && (
                    <button
                      onClick={() => handleCloseRoom(room.id)}
                      className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 text-sm font-medium"
                    >
                      Zamknij
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
          {rooms.length === 0 && (
            <li className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
              Brak utworzonych pokojów. Utwórz nowy pokój, aby rozpocząć.
            </li>
          )}
        </ul>
      </div>

      <ConfirmModal
        isOpen={closeRoomConfirm.open}
        onClose={() => setCloseRoomConfirm({ open: false, roomId: null })}
        onConfirm={confirmCloseRoom}
        title="Zamknij pokój"
        message="Czy na pewno chcesz zamknąć ten pokój? Uczniowie nie będą mogli już do niego dołączyć."
        confirmText="Zamknij"
        cancelText="Anuluj"
        type="warning"
      />
    </div>
  );
}
