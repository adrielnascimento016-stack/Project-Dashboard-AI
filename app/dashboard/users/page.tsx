'use client';

import { useAuth } from '@/components/auth-provider';
import { db } from '@/lib/firebase';
import { collection, query, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Shield, UserCog, Building2, Save } from 'lucide-react';

interface UserData {
  uid: string;
  email: string;
  name: string;
  role: 'admin' | 'gerente' | 'vendedor';
  unidade?: string;
  meta_mes?: number;
}

export default function UsersPage() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?.role !== 'admin') return;

    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: UserData[] = [];
      snapshot.forEach((doc) => {
        data.push({ ...doc.data() } as UserData);
      });
      setUsers(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [profile]);

  const handleRoleChange = async (uid: string, newRole: string) => {
    try {
      await updateDoc(doc(db, 'users', uid), { role: newRole });
    } catch (error) {
      console.error('Error updating role:', error);
      alert('Erro ao atualizar papel.');
    }
  };

  const handleUnidadeChange = async (uid: string, newUnidade: string) => {
    try {
      await updateDoc(doc(db, 'users', uid), { unidade: newUnidade });
    } catch (error) {
      console.error('Error updating unidade:', error);
      alert('Erro ao atualizar unidade.');
    }
  };

  if (profile?.role !== 'admin') {
    return <div className="p-8 text-red-500">Acesso negado. Apenas administradores podem ver esta página.</div>;
  }

  if (loading) {
    return <div className="p-8 text-slate-500">Carregando usuários...</div>;
  }

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
          <Shield className="w-8 h-8 text-blue-600" />
          Gerenciamento de Usuários
        </h1>
        <p className="text-slate-500 mt-1">Controle de acesso (RBAC) e alocação de unidades.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-sm">
              <th className="p-4 font-medium">Nome / Email</th>
              <th className="p-4 font-medium">Papel (Role)</th>
              <th className="p-4 font-medium">Unidade</th>
              <th className="p-4 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
            {users.map((user) => (
              <tr key={user.uid} className="hover:bg-slate-50 transition-colors">
                <td className="p-4">
                  <div className="font-medium text-slate-900">{user.name}</div>
                  <div className="text-slate-500 text-xs">{user.email}</div>
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    <UserCog className="w-4 h-4 text-slate-400" />
                    <select
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.uid, e.target.value)}
                      className="bg-white border border-slate-300 rounded-md px-2 py-1 text-sm focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="admin">Admin</option>
                      <option value="gerente">Gerente</option>
                      <option value="vendedor">Vendedor</option>
                    </select>
                  </div>
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-slate-400" />
                    <select
                      value={user.unidade || 'Matriz'}
                      onChange={(e) => handleUnidadeChange(user.uid, e.target.value)}
                      className="bg-white border border-slate-300 rounded-md px-2 py-1 text-sm focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="Todas">Todas</option>
                      <option value="Matriz">Matriz</option>
                      <option value="Filial Sul">Filial Sul</option>
                      <option value="Filial Norte">Filial Norte</option>
                    </select>
                  </div>
                </td>
                <td className="p-4 text-right">
                  <span className="text-xs text-slate-400">Salvo automaticamente</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
