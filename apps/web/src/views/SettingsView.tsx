import { useEffect, useState } from "react";
import type { CustomFieldDef, CustomFieldType } from "../domain";
import { portfolioSidebarLabel } from "../domain";
import {
  fetchCloudSyncStatus,
  fetchDatabaseConfig,
  saveCloudConfig,
  saveDatabaseConfig,
  type CloudSyncStatus,
  type DatabaseConfigStatus,
} from "../sync";
import { useStore } from "../store";
import "../styles/settings.css";

const TYPE_LABELS: Record<CustomFieldType, string> = {
  text: "Texte",
  number: "Nombre",
  select: "Liste de choix",
};

const DB_SOURCE_LABELS: Record<DatabaseConfigStatus["source"], string> = {
  file: "Fichier local",
  env: "Fichier .env",
  none: "Non configurée",
  desktop: "SQLite locale",
};

const EMPTY: CustomFieldDef[] = [];
const CURRENT_YEAR = new Date().getFullYear();
const FISCAL_YEARS = Array.from({ length: 11 }, (_, i) => CURRENT_YEAR - 5 + i);

export function SettingsView() {
  const portfolio = useStore((s) => s.portfolio);
  const fields = portfolio.customFields ?? EMPTY;
  const addCustomField = useStore((s) => s.addCustomField);
  const removeCustomField = useStore((s) => s.removeCustomField);
  const updateAppSettings = useStore((s) => s.updateAppSettings);

  const [appName, setAppName] = useState(portfolio.appName ?? "Atelier");
  const [portfolioLabel, setPortfolioLabel] = useState(portfolio.name);
  const [fiscalYear, setFiscalYear] = useState(portfolio.fiscalYear ?? CURRENT_YEAR);

  const [dbStatus, setDbStatus] = useState<DatabaseConfigStatus | null>(null);
  const [dbError, setDbError] = useState(false);
  const [databaseUrl, setDatabaseUrl] = useState("");
  const [directUrl, setDirectUrl] = useState("");
  const [dbSaving, setDbSaving] = useState(false);
  const [dbSaved, setDbSaved] = useState(false);
  const [dbMessage, setDbMessage] = useState<string | null>(null);

  const [cloudStatus, setCloudStatus] = useState<CloudSyncStatus | null>(null);
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [cloudDatabaseUrl, setCloudDatabaseUrl] = useState("");
  const [cloudDirectUrl, setCloudDirectUrl] = useState("");
  const [cloudSaving, setCloudSaving] = useState(false);
  const [cloudMessage, setCloudMessage] = useState<string | null>(null);
  const [cloudError, setCloudError] = useState(false);

  const [name, setName] = useState("");
  const [type, setType] = useState<CustomFieldType>("text");
  const [options, setOptions] = useState("");

  useEffect(() => {
    setAppName(portfolio.appName ?? "Atelier");
    setPortfolioLabel(portfolio.name);
    setFiscalYear(portfolio.fiscalYear ?? CURRENT_YEAR);
  }, [portfolio.appName, portfolio.name, portfolio.fiscalYear]);

  useEffect(() => {
    fetchDatabaseConfig()
      .then(setDbStatus)
      .catch(() => setDbError(true));
    fetchCloudSyncStatus()
      .then((status) => {
        setCloudStatus(status);
        setCloudEnabled(status.enabled);
      })
      .catch(() => setCloudError(true));
  }, [dbSaved, cloudSaving]);

  function saveGeneral() {
    updateAppSettings({
      appName: appName.trim() || "Atelier",
      name: portfolioLabel.trim() || "Portefeuille",
      fiscalYear,
    });
  }

  async function saveDatabase() {
    if (!databaseUrl.trim()) return;
    setDbSaving(true);
    setDbMessage(null);
    try {
      await saveDatabaseConfig({
        databaseUrl: databaseUrl.trim(),
        directUrl: directUrl.trim() || undefined,
      });
      setDatabaseUrl("");
      setDirectUrl("");
      setDbError(false);
      setDbMessage("Connexion enregistrée et appliquée.");
      setDbSaved((v) => !v);
    } catch (err) {
      setDbError(true);
      setDbMessage(err instanceof Error ? err.message : "Échec de l'enregistrement.");
    } finally {
      setDbSaving(false);
    }
  }

  async function saveCloud() {
    setCloudSaving(true);
    setCloudMessage(null);
    try {
      await saveCloudConfig({
        enabled: cloudEnabled,
        databaseUrl: cloudDatabaseUrl.trim() || undefined,
        directUrl: cloudDirectUrl.trim() || undefined,
      });
      setCloudDatabaseUrl("");
      setCloudDirectUrl("");
      setCloudError(false);
      setCloudMessage(cloudEnabled ? "Synchronisation cloud activée." : "Synchronisation cloud désactivée.");
    } catch (err) {
      setCloudError(true);
      setCloudMessage(err instanceof Error ? err.message : "Échec de la configuration cloud.");
    } finally {
      setCloudSaving(false);
    }
  }

  function submitField() {
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

  const generalDirty =
    (appName.trim() || "Atelier") !== (portfolio.appName ?? "Atelier") ||
    (portfolioLabel.trim() || "Portefeuille") !== portfolio.name ||
    fiscalYear !== (portfolio.fiscalYear ?? CURRENT_YEAR);

  return (
    <>
      <div className="view-header set-page-header">
        <div>
          <h1>Paramètres</h1>
          <span className="sub">Identité de l'application, base de données, synchronisation cloud et champs métier.</span>
        </div>
      </div>

      <div className="view-body settings-body">
        <div className="settings-grid">
          <section className="set-card">
            <div className="set-card-head">
              <h2>Général</h2>
              <p className="set-hint">
                Affiché dans la barre latérale et le titre du navigateur. L'année d'exercice est ajoutée à l'objet.
              </p>
            </div>

            <div className="set-fields-grid set-fields-general">
              <label className="set-field">
                <span>Nom de l'application</span>
                <input
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="Ex. Atelier"
                />
              </label>
              <label className="set-field">
                <span>Objet du portefeuille</span>
                <input
                  value={portfolioLabel}
                  onChange={(e) => setPortfolioLabel(e.target.value)}
                  placeholder="Ex. Portefeuille DSI"
                />
              </label>
              <label className="set-field">
                <span>Année d'exercice</span>
                <select value={fiscalYear} onChange={(e) => setFiscalYear(Number(e.target.value))}>
                  {FISCAL_YEARS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="set-preview" aria-hidden="true">
              <span className="set-preview-kicker">Aperçu sidebar</span>
              <span className="set-preview-name">{appName.trim() || "Atelier"}</span>
              <span className="set-preview-sub">
                {portfolioSidebarLabel(portfolioLabel, fiscalYear)}
              </span>
            </div>

            <footer className="set-card-foot">
              <button className="set-save" onClick={saveGeneral} disabled={!generalDirty}>
                Enregistrer
              </button>
            </footer>
          </section>

          <section className="set-card">
            <div className="set-card-head">
              <h2>{cloudStatus?.desktop ? "Base locale" : "Base de données Neon"}</h2>
              <p className="set-hint">
                {cloudStatus?.desktop
                  ? "SQLite embarquée dans le profil utilisateur. Fonctionne hors ligne."
                  : "Connexion PostgreSQL côté serveur. Prioritaire sur le fichier `.env`."}
              </p>
            </div>

            {dbError && !cloudStatus?.desktop && (
              <div className="set-callout warn">API hors ligne — impossible de lire la configuration actuelle.</div>
            )}

            {dbStatus && (
              <dl className="set-status">
                <div className="set-status-row">
                  <dt>Source</dt>
                  <dd>
                    <span className={`set-badge ${dbStatus.source}`}>{DB_SOURCE_LABELS[dbStatus.source]}</span>
                  </dd>
                </div>
                {dbStatus.configured && (
                  <>
                    <div className="set-status-row">
                      <dt>{cloudStatus?.desktop ? "Fichier" : "Pooler"}</dt>
                      <dd className="set-url" title={dbStatus.databaseUrlMasked}>
                        {dbStatus.databaseUrlMasked}
                      </dd>
                    </div>
                    {!cloudStatus?.desktop && dbStatus.directUrlMasked !== dbStatus.databaseUrlMasked && (
                      <div className="set-status-row">
                        <dt>Direct</dt>
                        <dd className="set-url" title={dbStatus.directUrlMasked}>
                          {dbStatus.directUrlMasked}
                        </dd>
                      </div>
                    )}
                  </>
                )}
              </dl>
            )}

            {!cloudStatus?.desktop && (
              <>
                <div className="set-callout">
                  La connexion est testée et appliquée automatiquement — aucun redémarrage manuel requis.
                </div>

                {dbMessage && (
                  <p className={`set-feedback${dbError ? " warn" : " ok"}`}>{dbMessage}</p>
                )}

                <div className="set-fields-stack">
                  <label className="set-field">
                    <span>URL pooler</span>
                    <input
                      type="password"
                      value={databaseUrl}
                      onChange={(e) => setDatabaseUrl(e.target.value)}
                      placeholder="postgresql://user:password@host-pooler…/dbname?sslmode=require"
                      autoComplete="off"
                    />
                  </label>
                  <label className="set-field">
                    <span>URL directe <em className="set-optional">(optionnel)</em></span>
                    <input
                      type="password"
                      value={directUrl}
                      onChange={(e) => setDirectUrl(e.target.value)}
                      placeholder="postgresql://user:password@host…/dbname?sslmode=require"
                      autoComplete="off"
                    />
                  </label>
                </div>

                <footer className="set-card-foot">
                  <button
                    className="set-save"
                    onClick={() => void saveDatabase()}
                    disabled={!databaseUrl.trim() || dbSaving}
                  >
                    {dbSaving ? "Enregistrement…" : "Enregistrer la connexion"}
                  </button>
                </footer>
              </>
            )}
          </section>

          {cloudStatus?.desktop && (
            <section className="set-card">
              <div className="set-card-head">
                <h2>Synchronisation cloud</h2>
                <p className="set-hint">
                  Réplique automatique vers Neon. Last-write-wins avec notification en cas de conflit.
                </p>
              </div>

              {cloudError && (
                <div className="set-callout warn">Impossible de lire l'état de synchronisation.</div>
              )}

              {cloudStatus && (
                <dl className="set-status">
                  <div className="set-status-row">
                    <dt>État</dt>
                    <dd>{cloudStatus.enabled ? (cloudStatus.online ? "Connecté" : "Hors ligne") : "Désactivée"}</dd>
                  </div>
                  {cloudStatus.lastSyncedAt && (
                    <div className="set-status-row">
                      <dt>Dernière sync</dt>
                      <dd>{new Date(cloudStatus.lastSyncedAt).toLocaleString()}</dd>
                    </div>
                  )}
                  {cloudStatus.enabled && (
                    <>
                      <div className="set-status-row">
                        <dt>Révision locale</dt>
                        <dd>{cloudStatus.localRevision ?? 0}</dd>
                      </div>
                      <div className="set-status-row">
                        <dt>Révision cloud</dt>
                        <dd>{cloudStatus.cloudRevision ?? 0}</dd>
                      </div>
                      {cloudStatus.cloudUrlMasked && (
                        <div className="set-status-row">
                          <dt>Neon</dt>
                          <dd className="set-url">{cloudStatus.cloudUrlMasked}</dd>
                        </div>
                      )}
                    </>
                  )}
                </dl>
              )}

              {cloudMessage && (
                <p className={`set-feedback${cloudError ? " warn" : " ok"}`}>{cloudMessage}</p>
              )}

              <label className="set-field set-field-inline">
                <span>Activer la synchronisation cloud</span>
                <input
                  type="checkbox"
                  checked={cloudEnabled}
                  onChange={(e) => setCloudEnabled(e.target.checked)}
                />
              </label>

              {cloudEnabled && (
                <div className="set-fields-stack">
                  <label className="set-field">
                    <span>URL pooler Neon</span>
                    <input
                      type="password"
                      value={cloudDatabaseUrl}
                      onChange={(e) => setCloudDatabaseUrl(e.target.value)}
                      placeholder="postgresql://user:password@host-pooler…/dbname?sslmode=require"
                      autoComplete="off"
                    />
                  </label>
                  <label className="set-field">
                    <span>URL directe <em className="set-optional">(optionnel)</em></span>
                    <input
                      type="password"
                      value={cloudDirectUrl}
                      onChange={(e) => setCloudDirectUrl(e.target.value)}
                      placeholder="postgresql://user:password@host…/dbname?sslmode=require"
                      autoComplete="off"
                    />
                  </label>
                </div>
              )}

              <footer className="set-card-foot">
                <button
                  className="set-save"
                  onClick={() => void saveCloud()}
                  disabled={cloudSaving || (cloudEnabled && !cloudDatabaseUrl.trim() && !cloudStatus?.enabled)}
                >
                  {cloudSaving ? "Enregistrement…" : "Enregistrer la synchronisation"}
                </button>
              </footer>
            </section>
          )}
        </div>

        <section className="set-card set-card-wide">
          <div className="set-card-head">
            <h2>Champs personnalisés</h2>
            <p className="set-hint">Colonnes métier sur les tâches, visibles dans l'inspecteur de tâche.</p>
          </div>

          {fields.length === 0 ? (
            <p className="set-empty">Aucun champ défini pour l'instant.</p>
          ) : (
            <div className="set-table-wrap">
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
            </div>
          )}

          <div className="set-divider" />

          <h3 className="set-subhead">Ajouter un champ</h3>
          <div className="set-fields-grid set-fields-grid-3">
            <label className="set-field">
              <span>Nom</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex. Lot fonctionnel"
                onKeyDown={(e) => e.key === "Enter" && submitField()}
              />
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
            {type === "select" ? (
              <label className="set-field set-field-span">
                <span>Choix (virgules)</span>
                <input
                  value={options}
                  onChange={(e) => setOptions(e.target.value)}
                  placeholder="Faible, Moyen, Élevé"
                />
              </label>
            ) : (
              <div className="set-field set-field-action">
                <button className="set-save" onClick={submitField} disabled={!name.trim()}>
                  Ajouter
                </button>
              </div>
            )}
          </div>
          {type === "select" && (
            <footer className="set-card-foot">
              <button className="set-save" onClick={submitField} disabled={!name.trim()}>
                Ajouter
              </button>
            </footer>
          )}
        </section>
      </div>
    </>
  );
}
