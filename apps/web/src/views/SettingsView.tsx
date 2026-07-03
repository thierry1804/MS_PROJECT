import { useState } from "react";
import type { CustomFieldDef, CustomFieldType } from "../domain";
import { useStore } from "../store";
import "../styles/settings.css";

const TYPE_LABELS: Record<CustomFieldType, string> = {
  text: "Texte",
  number: "Nombre",
  select: "Liste de choix",
};

const EMPTY: CustomFieldDef[] = [];

export function SettingsView() {
  const fields = useStore((s) => s.portfolio.customFields) ?? EMPTY;
  const addCustomField = useStore((s) => s.addCustomField);
  const removeCustomField = useStore((s) => s.removeCustomField);

  const [name, setName] = useState("");
  const [type, setType] = useState<CustomFieldType>("text");
  const [options, setOptions] = useState("");

  function submit() {
    if (!name.trim()) return;
    const field: CustomFieldDef = {
      id: `cf-${Math.random().toString(36).slice(2, 8)}`,
      name: name.trim(),
      type,
      ...(type === "select"
        ? { options: options.split(",").map((o) => o.trim()).filter(Boolean) }
        : {}),
    };
    addCustomField(field);
    setName("");
    setType("text");
    setOptions("");
  }

  return (
    <>
      <div className="view-header">
        <h1>Paramètres · Champs personnalisés</h1>
        <span className="sub">
          Ajoutez des colonnes métier aux tâches (criticité, lot, fournisseur…). Elles apparaissent dans
          l'inspecteur de tâche.
        </span>
      </div>

      <div className="view-body settings-body">
        <section className="set-card">
          <h2>Champs définis</h2>
          {fields.length === 0 ? (
            <p className="set-empty">Aucun champ personnalisé. Créez-en un ci-dessous.</p>
          ) : (
            <table className="set-table">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Type</th>
                  <th>Choix</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {fields.map((f) => (
                  <tr key={f.id}>
                    <td className="strong">{f.name}</td>
                    <td>{TYPE_LABELS[f.type]}</td>
                    <td className="muted">{f.options?.join(", ") ?? "—"}</td>
                    <td className="c">
                      <button className="set-del" onClick={() => removeCustomField(f.id)} title="Supprimer">
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="set-card">
          <h2>Nouveau champ</h2>
          <div className="set-form">
            <label className="set-field grow">
              <span>Nom du champ</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Lot fonctionnel" onKeyDown={(e) => e.key === "Enter" && submit()} />
            </label>
            <label className="set-field">
              <span>Type</span>
              <select value={type} onChange={(e) => setType(e.target.value as CustomFieldType)}>
                {(Object.keys(TYPE_LABELS) as CustomFieldType[]).map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            {type === "select" && (
              <label className="set-field grow">
                <span>Choix (séparés par des virgules)</span>
                <input value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Faible, Moyen, Élevé" />
              </label>
            )}
            <button className="set-add" onClick={submit} disabled={!name.trim()}>
              Ajouter le champ
            </button>
          </div>
        </section>
      </div>
    </>
  );
}
