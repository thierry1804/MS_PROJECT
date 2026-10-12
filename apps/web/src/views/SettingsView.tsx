import { useEffect, useState } from "react";
import type { CustomFieldDef, CustomFieldType } from "../domain";
import { portfolioSidebarLabel } from "../domain";
import {
  fetchAiConfig,
  fetchCloudSyncStatus,
  fetchCopilotMemory,
  fetchDatabaseConfig,
  resetCopilotMemoryApi,
  saveAiConfig,
  saveCloudConfig,
  saveDatabaseConfig,
  testAiConfig,
  type AiConfigStatus,
  type AiPreset,
  type CloudSyncStatus,
  type DatabaseConfigStatus,
  type WireCopilotMemory,
} from "../sync";
import { isDesktopShell } from "../api-url";
import { useStore } from "../store";
import "../styles/settings.css";

const TYPE_LABELS: Record<CustomFieldType, string> = {
  text: "Texte",
  number: "Nombre",
  select: "Liste de choix",
};

const AI_PRESET_LABELS: Record<AiPreset, string> = {
  openrouter: "OpenRouter",
  openai: "OpenAI",
  custom: "Personnalisé",
};

const AI_PRESET_DEFAULTS: Record<AiPreset, { baseUrl: string; model: string }> = {
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-oss-120b:free" },
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  custom: { baseUrl: "", model: "" },
};

const OPENROUTER_FREE_MODELS = [
  { id: "openai/gpt-oss-120b:free", label: "GPT-OSS 120B — raisonnement, JSON structuré (recommandé)" },
  { id: "nvidia/nemotron-3-super-120b-a12b:free", label: "Nemotron 3 Super 120B — agentique" },
  { id: "deepseek/deepseek-r1:free", label: "DeepSeek R1 — raisonnement profond" },
  { id: "openrouter/free", label: "Auto — meilleur modèle gratuit disponible" },
] as const;

function openRouterModelOptions(currentModel: string) {
  const known = new Set<string>(OPENROUTER_FREE_MODELS.map((m) => m.id));
  if (currentModel && !known.has(currentModel)) {
    return [...OPENROUTER_FREE_MODELS, { id: currentModel, label: `${currentModel} (personnalisé)` }];
  }
  return OPENROUTER_FREE_MODELS;
}

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

  const [aiStatus, setAiStatus] = useState<AiConfigStatus | null>(null);
  const [aiError, setAiError] = useState(false);
  const [aiPreset, setAiPreset] = useState<AiPreset>("openrouter");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiBaseUrl, setAiBaseUrl] = useState(AI_PRESET_DEFAULTS.openrouter.baseUrl);
  const [aiModel, setAiModel] = useState(AI_PRESET_DEFAULTS.openrouter.model);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiTesting, setAiTesting] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [aiSaved, setAiSaved] = useState(false);

  const [copilotMemory, setCopilotMemory] = useState<WireCopilotMemory | null>(null);
  const [copilotMemError, setCopilotMemError] = useState(false);
  const [copilotResetting, setCopilotResetting] = useState(false);

  const desktopMode = isDesktopShell() || Boolean(cloudStatus?.desktop);

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
    fetchAiConfig()
      .then((status) => {
        setAiStatus(status);
        setAiPreset(status.preset);
        if (status.baseUrl) setAiBaseUrl(status.baseUrl);
        if (status.model) setAiModel(status.model);
      })
      .catch(() => setAiError(true));
    fetchCopilotMemory()
      .then(setCopilotMemory)
      .catch(() => setCopilotMemError(true));
  }, [dbSaved, cloudSaving, aiSaved]);

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

  function onAiPresetChange(preset: AiPreset) {
    setAiPreset(preset);
    if (preset !== "custom") {
      setAiBaseUrl(AI_PRESET_DEFAULTS[preset].baseUrl);
      setAiModel(AI_PRESET_DEFAULTS[preset].model);
    }
  }

  async function saveAi() {
    setAiSaving(true);
    setAiMessage(null);
    try {
      const status = await saveAiConfig({
        preset: aiPreset,
        apiKey: aiApiKey.trim() || undefined,
        baseUrl: aiBaseUrl.trim() || undefined,
        model: aiModel.trim() || undefined,
      });
      setAiStatus(status);
      setAiApiKey("");
      setAiError(false);
      setAiMessage("Configuration IA enregistrée.");
      setAiSaved((v) => !v);
    } catch (err) {
      setAiError(true);
      setAiMessage(err instanceof Error ? err.message : "Échec de l'enregistrement IA.");
    } finally {
      setAiSaving(false);
    }
  }

  async function runAiTest() {
    setAiTesting(true);
    setAiMessage(null);
    try {
      const result = await testAiConfig();
      setAiMessage(result.ok ? "Connexion IA OK." : (result.error ?? "Échec du test."));
      setAiError(!result.ok);
    } catch (err) {
      setAiError(true);
      setAiMessage(err instanceof Error ? err.message : "Échec du test IA.");
    } finally {
      setAiTesting(false);
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
              <h2>{desktopMode ? "Base locale" : "Base de données Neon"}</h2>
              <p className="set-hint">
                {desktopMode
                  ? "SQLite embarquée dans le profil utilisateur. Fonctionne hors ligne."
                  : "Connexion PostgreSQL côté serveur. Prioritaire sur le fichier `.env`."}
              </p>
            </div>

            {dbError && !desktopMode && (
              <div className="set-callout warn">API hors ligne — impossible de lire la configuration actuelle.</div>
            )}
            {dbError && desktopMode && (
              <div className="set-callout warn">API locale indisponible — redémarrez l'application.</div>
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
                      <dt>{desktopMode ? "Fichier" : "Pooler"}</dt>
                      <dd className="set-url" title={dbStatus.databaseUrlMasked}>
                        {dbStatus.databaseUrlMasked}
                      </dd>
                    </div>
                    {!desktopMode && dbStatus.directUrlMasked !== dbStatus.databaseUrlMasked && (
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

            {!desktopMode && (
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

          {desktopMode && (
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

          <section className="set-card set-card-wide">
          <div className="set-card-head">
            <h2>Assistant IA (risques)</h2>
            <p className="set-hint">
              Enrichissement LLM via OpenRouter (modèles gratuits recommandés) ou API OpenAI-compatible.
              Créez une clé sur{" "}
              <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
                openrouter.ai/keys
              </a>
              . Sans clé, l'assistant utilise les heuristiques locales.
            </p>
          </div>

          {aiError && !aiStatus && (
            <div className="set-callout warn">API hors ligne — impossible de lire la configuration IA.</div>
          )}

          {aiStatus && (
            <dl className="set-status">
              <div className="set-status-row">
                <dt>État</dt>
                <dd>
                  <span className={`set-badge ${aiStatus.configured ? "file" : "none"}`}>
                    {aiStatus.configured ? "IA activée" : "Mode heuristique seul"}
                  </span>
                </dd>
              </div>
              {aiStatus.configured && (
                <>
                  <div className="set-status-row">
                    <dt>Clé</dt>
                    <dd>{aiStatus.apiKeyMasked || "—"}</dd>
                  </div>
                  <div className="set-status-row">
                    <dt>Modèle</dt>
                    <dd>{aiStatus.model}</dd>
                  </div>
                </>
              )}
            </dl>
          )}

          {aiMessage && <p className={`set-feedback${aiError ? " warn" : " ok"}`}>{aiMessage}</p>}

          <div className="set-fields-grid set-fields-grid-3">
            <label className="set-field">
              <span>Fournisseur</span>
              <select value={aiPreset} onChange={(e) => onAiPresetChange(e.target.value as AiPreset)}>
                {(Object.keys(AI_PRESET_LABELS) as AiPreset[]).map((p) => (
                  <option key={p} value={p}>
                    {AI_PRESET_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="set-field set-field-span-2">
              <span>Clé API</span>
              <input
                type="password"
                value={aiApiKey}
                onChange={(e) => setAiApiKey(e.target.value)}
                placeholder={aiStatus?.apiKeyMasked ? "Laisser vide pour conserver la clé actuelle" : "sk-or-…"}
                autoComplete="off"
              />
            </label>
            <label className="set-field set-field-span">
              <span>URL de base</span>
              <input
                value={aiBaseUrl}
                onChange={(e) => setAiBaseUrl(e.target.value)}
                placeholder="https://openrouter.ai/api/v1"
              />
            </label>
            <label className="set-field set-field-span">
              <span>Modèle</span>
              {aiPreset === "openrouter" ? (
                <select value={aiModel} onChange={(e) => setAiModel(e.target.value)}>
                  {openRouterModelOptions(aiModel).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                  placeholder="gpt-4o-mini"
                />
              )}
            </label>
          </div>

          <footer className="set-card-foot">
            <button className="set-save ghost" type="button" onClick={() => void runAiTest()} disabled={aiTesting}>
              {aiTesting ? "Test…" : "Tester la connexion"}
            </button>
            <button className="set-save" type="button" onClick={() => void saveAi()} disabled={aiSaving}>
              {aiSaving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </footer>
          </section>

          <section className="set-card set-card-wide">
            <div className="set-card-head">
              <h2>Copilot — mémoire d'apprentissage</h2>
              <p className="set-hint">
                Préférences et corrections mémorisées par le panneau Copilot. Synchronisées avec Neon en mode desktop si la sync cloud est active.
              </p>
            </div>

            {copilotMemError && (
              <div className="set-callout warn">Impossible de charger la mémoire copilot.</div>
            )}

            {copilotMemory && (
              <dl className="set-status">
                <div className="set-status-row">
                  <dt>Chef de projet par défaut</dt>
                  <dd>{String(copilotMemory.preferences?.defaultProjectManager ?? "—")}</dd>
                </div>
                <div className="set-status-row">
                  <dt>Désambiguïsations</dt>
                  <dd>{copilotMemory.disambiguations?.length ?? 0}</dd>
                </div>
                <div className="set-status-row">
                  <dt>Épisodes mémorisés</dt>
                  <dd>{copilotMemory.episodes?.length ?? 0}</dd>
                </div>
                <div className="set-status-row">
                  <dt>Révision</dt>
                  <dd>{copilotMemory.revision}</dd>
                </div>
              </dl>
            )}

            <footer className="set-card-foot">
              <button
                className="set-save ghost"
                type="button"
                disabled={copilotResetting}
                onClick={() => {
                  if (!window.confirm("Réinitialiser toute la mémoire copilot ?")) return;
                  setCopilotResetting(true);
                  void resetCopilotMemoryApi()
                    .then(setCopilotMemory)
                    .finally(() => setCopilotResetting(false));
                }}
              >
                {copilotResetting ? "Réinitialisation…" : "Réinitialiser la mémoire copilot"}
              </button>
            </footer>
          </section>

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
      </div>
    </>
  );
}
