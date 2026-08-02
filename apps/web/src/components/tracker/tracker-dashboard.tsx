"use client";

import { useState } from "react";
import { deactivateTrackerTargetAction } from "../../lib/tracker/actions";
import type { TargetWithObservations } from "@seovista/worker";

export function TrackerDashboard({
  token,
  targets,
  email,
}: {
  token: string;
  targets: TargetWithObservations[];
  email: string;
}) {
  const [removing, setRemoving] = useState<string | null>(null);

  async function handleDeactivate(targetId: string) {
    setRemoving(targetId);
    try {
      await deactivateTrackerTargetAction(token, targetId);
      // Reload the page to reflect the change (RSC will re-render)
      window.location.reload();
    } catch {
      setRemoving(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <p className="text-sm text-slate-600">
          Hesap: <span className="font-mono font-medium text-slate-800">{email}</span>
        </p>
      </div>

      {targets.length === 0 ? (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm text-center">
          <p className="text-slate-600">
            Henüz takip edilen anahtar kelime yok. Yukarıdaki formdan yeni bir hedef ekleyebilirsiniz.
          </p>
        </div>
      ) : (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-slate-900">Takip Edilen Hedefler</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th scope="col" className="py-2 pr-4 font-semibold">Anahtar Kelime</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Alan Adı</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Son Sıra</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Son Kontrol</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Son 7 Gözlem</th>
                  <th scope="col" className="py-2 font-semibold">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {targets.map((target) => (
                  <tr key={target.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 text-slate-900 font-medium">{target.keyword}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-slate-600">{target.domain}</td>
                    <td className="py-2 pr-4 tabular-nums text-slate-700">
                      {target.latestPosition !== null && target.latestPosition > 0
                        ? `#${target.latestPosition}`
                        : target.latestPosition === 0
                        ? "İlk 10'da yok"
                        : "Henüz kontrol edilmedi"}
                    </td>
                    <td className="py-2 pr-4 text-slate-600 text-xs">
                      {target.latestCheckedAt
                        ? new Date(target.latestCheckedAt).toLocaleDateString("tr-TR")
                        : "—"}
                    </td>
                    <td className="py-2 pr-4">
                      {target.recentObservations.length > 0 ? (
                        <div className="flex gap-1 flex-wrap">
                          {target.recentObservations.map((obs, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs tabular-nums text-slate-600"
                              title={new Date(obs.checkedAt).toLocaleDateString("tr-TR")}
                            >
                              {obs.position > 0 ? `#${obs.position}` : "—"}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs">Henüz veri yok</span>
                      )}
                    </td>
                    <td className="py-2">
                      {target.active && (
                        <button
                          type="button"
                          onClick={() => handleDeactivate(target.id)}
                          disabled={removing === target.id}
                          className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                        >
                          {removing === target.id ? "Kaldırılıyor..." : "Kaldır"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
