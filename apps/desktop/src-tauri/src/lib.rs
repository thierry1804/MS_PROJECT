use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{Manager, RunEvent};

struct ApiProcess(Mutex<Option<Child>>);

fn monorepo_root() -> PathBuf {
  PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    .parent()
    .unwrap()
    .parent()
    .unwrap()
    .parent()
    .unwrap()
    .to_path_buf()
}

fn spawn_api(app: &tauri::App, db_url: String) -> Result<Child, std::io::Error> {
  let api_dir = monorepo_root().join("apps/api");

  let mut cmd = if cfg!(debug_assertions) {
    let mut c = Command::new("pnpm");
    c.args(["exec", "tsx", "src/server.ts"]).current_dir(&api_dir);
    c
  } else {
    let server = app
      .path()
      .resource_dir()
      .expect("resource dir")
      .join("api/server.mjs");
    let mut c = Command::new("node");
    c.arg(server).current_dir(&api_dir);
    c
  };

  cmd.env("DESKTOP_MODE", "1")
    .env("DATABASE_URL", db_url)
    .env("PORT", "8888")
    .stdout(Stdio::null())
    .stderr(Stdio::null())
    .spawn()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
      std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
      let db_path = data_dir.join("portfolio.db");
      let db_url = format!("file:{}", db_path.display());

      let child = spawn_api(app, db_url).map_err(|e| e.to_string())?;
      app.manage(ApiProcess(Mutex::new(Some(child))));

      std::thread::sleep(std::time::Duration::from_millis(1200));
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app_handle, event| {
      if let RunEvent::Exit = event {
        if let Some(state) = app_handle.try_state::<ApiProcess>() {
          if let Ok(mut guard) = state.0.lock() {
            if let Some(mut child) = guard.take() {
              let _ = child.kill();
            }
          }
        }
      }
    });
}
