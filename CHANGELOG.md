# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and the project aims
to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) once it
reaches 1.0.

## [Unreleased]

### Added

- Event-based (CDC) delivery for **MySQL** (binlog), **MongoDB** (change
  streams), and **Redis** (keyspace notifications), alongside the existing
  PostgreSQL logical-replication support. Each engine sits behind a shared
  `CdcProvider` interface.
- The `{{$op}}` payload token, exposing the change operation
  (`insert` / `update` / `delete`) for CDC and watch hooks.

### Changed

- Renamed the project to **Syncle**.
- The internal metadata store now runs on **PostgreSQL** instead of SQLite.
- The live delivery monitor fetches one final time when a run finishes, so the
  last cells settle correctly; added a LIVE indicator and auto-follow paging.

### Fixed

- Delivery timeline now uses the run's snapshot `batchSize`, keeping cells
  aligned even after a hook is edited mid-run.
