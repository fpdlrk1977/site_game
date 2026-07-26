-- ============================================================
-- 0008_analytics_rpc — 대시보드 Analytics용 스키마 보정 + 집계 함수
--
-- 【먼저 고치는 것 — 기존 버그】
--   뷰어(`trackEvent`)는 click / area_enter / area_exit / interact 4종을
--   object_name과 함께 insert하는데, 실제 DB에는
--     ① object_name 컬럼이 없고
--     ② event_type 체크 제약이 ('view','click','area_enter')만 허용한다.
--   insert에 에러 처리가 없어 **상호작용 이벤트가 전부 조용히 실패**하고 있었다
--   (지금까지 실제로 쌓인 건 view 뿐).
--   → 아래에서 컬럼을 추가하고 제약을 실제 사용 값에 맞게 넓힌다.
--   ※ 0004_analytics.sql 파일에는 object_name이 적혀 있지만 이 DB에는 적용돼 있지
--     않았다(파일과 실제 스키마의 드리프트). 적용된 마이그레이션을 수정하는 대신
--     여기서 보정한다.
--
-- 【왜 집계를 RPC로 하나】
--   scene_events 원본 행을 그대로 끌어오면 PostgREST의 max_rows(기본 1000)에
--   잘려 **조용히 틀린 수치**가 나온다. 집계를 DB에서 끝내면 반환 행이
--   수십 개라 절대 잘리지 않는다.
--
--   security invoker(기본값) → 호출자의 RLS가 그대로 적용된다.
--   scene_events의 "owner reads" 정책 덕에 자기 씬 이벤트만 집계된다(추가 소유자 체크 불필요).
-- ============================================================

-- ── 스키마 보정 ────────────────────────────────────────────
alter table public.scene_events add column if not exists object_name text;

-- event_type 체크 제약을 실제 사용 값으로 교체.
-- 제약 이름을 확신할 수 없으므로 event_type을 참조하는 CHECK를 전부 찾아 지운 뒤 새로 건다.
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.scene_events'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%event_type%'
  loop
    execute format('alter table public.scene_events drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.scene_events
  add constraint scene_events_event_type_check
  check (event_type in ('view', 'click', 'area_enter', 'area_exit', 'interact'));

-- ── 집계 함수 ──────────────────────────────────────────────

-- 일자별 이벤트 수 (최대 days × 이벤트종류 행)
create or replace function public.owner_events_daily(p_days int default 30)
returns table (day date, event_type text, cnt bigint)
language sql stable security invoker as $$
  select (e.created_at at time zone 'UTC')::date as day,
         e.event_type,
         count(*)::bigint
  from public.scene_events e
  where e.created_at >= now() - make_interval(days => p_days)
  group by 1, 2
  order by 1;
$$;

-- 씬별 이벤트 수
create or replace function public.owner_events_by_scene(p_days int default 30)
returns table (scene_id uuid, event_type text, cnt bigint)
language sql stable security invoker as $$
  select e.scene_id, e.event_type, count(*)::bigint
  from public.scene_events e
  where e.created_at >= now() - make_interval(days => p_days)
  group by 1, 2;
$$;

-- 가장 많이 상호작용된 오브젝트.
-- area_exit은 제외한다 — area_enter와 짝을 이루므로 함께 세면 같은 접촉이 두 번 계산된다.
create or replace function public.owner_events_top_objects(p_days int default 30, p_limit int default 12)
returns table (scene_id uuid, object_name text, cnt bigint)
language sql stable security invoker as $$
  select e.scene_id, e.object_name, count(*)::bigint
  from public.scene_events e
  where e.created_at >= now() - make_interval(days => p_days)
    and e.event_type in ('click', 'area_enter', 'interact')
    and e.object_name is not null
  group by 1, 2
  order by 3 desc
  limit p_limit;
$$;

grant execute on function public.owner_events_daily(int)              to authenticated;
grant execute on function public.owner_events_by_scene(int)           to authenticated;
grant execute on function public.owner_events_top_objects(int, int)   to authenticated;
