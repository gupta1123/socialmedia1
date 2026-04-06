create table if not exists public.festivals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  code text not null,
  name text not null,
  category text not null check (category in ('national', 'religious', 'cultural', 'seasonal', 'observance')),
  community text,
  regions_json jsonb not null default '[]'::jsonb,
  meaning text not null,
  date_label text,
  next_occurs_on date,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists festivals_system_code_idx
  on public.festivals (code)
  where workspace_id is null;

create unique index if not exists festivals_workspace_code_idx
  on public.festivals (workspace_id, code)
  where workspace_id is not null;

create index if not exists festivals_workspace_active_idx
  on public.festivals (workspace_id, active, next_occurs_on, sort_order);

alter table public.festivals enable row level security;

create policy "workspace members read festivals" on public.festivals
  for select using (
    workspace_id is null or public.is_workspace_member(workspace_id)
  );

create policy "editors manage festivals" on public.festivals
  for all using (
    workspace_id is not null and public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor'])
  );

drop trigger if exists set_festivals_updated_at on public.festivals;
create trigger set_festivals_updated_at
before update on public.festivals
for each row execute procedure public.set_updated_at();

insert into public.festivals (
  workspace_id,
  code,
  name,
  category,
  community,
  regions_json,
  meaning,
  date_label,
  next_occurs_on,
  active,
  sort_order
)
values
  (null, 'new-years-day', 'New Year''s Day', 'seasonal', null, '["india"]'::jsonb, 'Marks the beginning of the new calendar year and is commonly used for fresh-start and gratitude messaging.', '1 Jan 2026', '2026-01-01', true, 10),
  (null, 'makar-sankranti', 'Makar Sankranti', 'cultural', 'Hindu', '["india","maharashtra","gujarat"]'::jsonb, 'Celebrates the sun''s northward journey and is associated with harvest, light, and auspicious new beginnings.', '14 Jan 2026', '2026-01-14', true, 20),
  (null, 'vasant-panchami', 'Vasant Panchami', 'religious', 'Hindu', '["india"]'::jsonb, 'Welcomes spring and honors Saraswati, making it a festival of learning, creativity, and renewal.', '23 Jan 2026', '2026-01-23', true, 30),
  (null, 'republic-day', 'Republic Day', 'national', null, '["india"]'::jsonb, 'Marks the adoption of the Constitution of India and celebrates national pride, citizenship, and democratic values.', '26 Jan 2026', '2026-01-26', true, 40),
  (null, 'maha-shivaratri', 'Maha Shivaratri', 'religious', 'Hindu', '["india"]'::jsonb, 'Honors Lord Shiva and is associated with devotion, stillness, discipline, and spiritual reflection.', '15 Feb 2026', '2026-02-15', true, 50),
  (null, 'shivaji-jayanti', 'Shivaji Jayanti', 'observance', null, '["maharashtra"]'::jsonb, 'Commemorates the birth of Chhatrapati Shivaji Maharaj and celebrates leadership, courage, and Marathi pride.', '19 Feb 2026', '2026-02-19', true, 60),
  (null, 'holika-dahan', 'Holika Dahan', 'religious', 'Hindu', '["india"]'::jsonb, 'The bonfire night before Holi symbolizing the burning away of negativity and the victory of good over evil.', '3 Mar 2026', '2026-03-03', true, 70),
  (null, 'holi', 'Holi', 'religious', 'Hindu', '["india"]'::jsonb, 'The festival of colors celebrating spring, joy, togetherness, and the victory of good over evil.', '4 Mar 2026', '2026-03-04', true, 80),
  (null, 'gudi-padwa', 'Gudi Padwa', 'cultural', 'Hindu', '["maharashtra","goa"]'::jsonb, 'The Marathi New Year, associated with renewal, prosperity, and auspicious beginnings.', '19 Mar 2026', '2026-03-19', true, 90),
  (null, 'ugadi', 'Ugadi', 'cultural', 'Hindu', '["karnataka","andhra-pradesh","telangana"]'::jsonb, 'The Deccan New Year, celebrating fresh starts, reflection, and hope for the year ahead.', '19 Mar 2026', '2026-03-19', true, 100),
  (null, 'eid-ul-fitr', 'Eid ul-Fitr', 'religious', 'Muslim', '["india"]'::jsonb, 'Marks the end of Ramadan and celebrates gratitude, charity, prayer, and community.', '21 Mar 2026', '2026-03-21', true, 110),
  (null, 'rama-navami', 'Rama Navami', 'religious', 'Hindu', '["india"]'::jsonb, 'Celebrates the birth of Lord Rama and stands for righteousness, virtue, and devotion.', '26 Mar 2026', '2026-03-26', true, 120),
  (null, 'mahavir-jayanti', 'Mahavir Jayanti', 'religious', 'Jain', '["india"]'::jsonb, 'Commemorates the birth of Lord Mahavira and emphasizes peace, self-discipline, and non-violence.', '31 Mar 2026', '2026-03-31', true, 130),
  (null, 'good-friday', 'Good Friday', 'religious', 'Christian', '["india"]'::jsonb, 'Commemorates the crucifixion of Jesus Christ and is observed with reflection and reverence.', '3 Apr 2026', '2026-04-03', true, 140),
  (null, 'easter', 'Easter', 'religious', 'Christian', '["india"]'::jsonb, 'Celebrates the resurrection of Jesus Christ and carries themes of hope, renewal, and life.', '5 Apr 2026', '2026-04-05', true, 150),
  (null, 'vaisakhi', 'Vaisakhi', 'cultural', 'Sikh', '["india","punjab"]'::jsonb, 'A harvest celebration and a major Sikh festival marking the founding of the Khalsa and the spirit of gratitude.', '14 Apr 2026', '2026-04-14', true, 160),
  (null, 'akshaya-tritiya', 'Akshaya Tritiya', 'religious', 'Hindu', '["india"]'::jsonb, 'An auspicious day associated with prosperity, generosity, and new beginnings.', '19 Apr 2026', '2026-04-19', true, 170),
  (null, 'buddha-purnima', 'Buddha Purnima', 'religious', 'Buddhist', '["india"]'::jsonb, 'Honors the birth, enlightenment, and teachings of Gautama Buddha, with themes of peace and compassion.', '1 May 2026', '2026-05-01', true, 180),
  (null, 'bakrid', 'Bakrid (Eid al-Adha)', 'religious', 'Muslim', '["india"]'::jsonb, 'Honors devotion, sacrifice, and generosity in remembrance of Prophet Ibrahim''s faith.', '27 May 2026 (tentative)', '2026-05-27', true, 190),
  (null, 'muharram', 'Muharram / Ashura', 'religious', 'Muslim', '["india"]'::jsonb, 'A solemn Islamic observance of remembrance, especially honoring the sacrifice of Imam Hussain.', '26 Jun 2026 (tentative)', '2026-06-26', true, 200),
  (null, 'independence-day', 'Independence Day', 'national', null, '["india"]'::jsonb, 'Marks India''s independence and celebrates freedom, unity, and national progress.', '15 Aug 2026', '2026-08-15', true, 210),
  (null, 'milad-un-nabi', 'Milad un-Nabi', 'religious', 'Muslim', '["india"]'::jsonb, 'Commemorates the birth of Prophet Muhammad and is observed with prayer, remembrance, and reflection.', '26 Aug 2026 (tentative)', '2026-08-26', true, 220),
  (null, 'onam', 'Onam', 'cultural', null, '["kerala"]'::jsonb, 'Kerala''s harvest festival celebrating homecoming, abundance, community, and cultural pride.', '26 Aug 2026', '2026-08-26', true, 230),
  (null, 'raksha-bandhan', 'Raksha Bandhan', 'cultural', 'Hindu', '["india"]'::jsonb, 'Celebrates the bond of protection, affection, and care between siblings and loved ones.', '28 Aug 2026', '2026-08-28', true, 240),
  (null, 'janmashtami', 'Janmashtami', 'religious', 'Hindu', '["india"]'::jsonb, 'Celebrates the birth of Lord Krishna and carries themes of joy, devotion, and divine playfulness.', '4 Sep 2026', '2026-09-04', true, 250),
  (null, 'ganesh-chaturthi', 'Ganesh Chaturthi', 'religious', 'Hindu', '["india","maharashtra"]'::jsonb, 'Celebrates Lord Ganesha and symbolizes wisdom, auspicious beginnings, and the removal of obstacles.', '14 Sep 2026', '2026-09-14', true, 260),
  (null, 'gandhi-jayanti', 'Gandhi Jayanti', 'national', null, '["india"]'::jsonb, 'Commemorates Mahatma Gandhi and evokes values of peace, truth, and service.', '2 Oct 2026', '2026-10-02', true, 270),
  (null, 'sharad-navratri', 'Sharad Navratri', 'religious', 'Hindu', '["india"]'::jsonb, 'Nine nights dedicated to Goddess Durga, associated with devotion, feminine strength, and celebration.', 'Starts 11 Oct 2026', '2026-10-11', true, 280),
  (null, 'dussehra', 'Dussehra / Vijayadashami', 'religious', 'Hindu', '["india"]'::jsonb, 'Celebrates the victory of good over evil and is associated with courage, clarity, and triumph.', '20 Oct 2026', '2026-10-20', true, 290),
  (null, 'karwa-chauth', 'Karwa Chauth', 'cultural', 'Hindu', '["north-india"]'::jsonb, 'A traditional observance centered on devotion, wellbeing, and marital bond.', '29 Oct 2026', '2026-10-29', true, 300),
  (null, 'diwali', 'Diwali / Deepavali', 'religious', 'Hindu', '["india"]'::jsonb, 'The festival of lights symbolizing hope, renewal, prosperity, and the victory of light over darkness.', '8 Nov 2026', '2026-11-08', true, 310),
  (null, 'bhai-duj', 'Bhai Duj', 'cultural', 'Hindu', '["india"]'::jsonb, 'Celebrates the affection and bond between brothers and sisters after Diwali.', '11 Nov 2026', '2026-11-11', true, 320),
  (null, 'chhat-puja', 'Chhat Puja', 'religious', 'Hindu', '["bihar","jharkhand","uttar-pradesh"]'::jsonb, 'A sun worship festival centered on gratitude, discipline, and devotion to natural forces.', '15 Nov 2026', '2026-11-15', true, 330),
  (null, 'guru-nanak-jayanti', 'Guru Nanak Jayanti', 'religious', 'Sikh', '["india"]'::jsonb, 'Commemorates the birth of Guru Nanak and reflects values of equality, service, and spiritual humility.', '24 Nov 2026', '2026-11-24', true, 340),
  (null, 'christmas', 'Christmas', 'religious', 'Christian', '["india"]'::jsonb, 'Celebrates the birth of Jesus Christ and is associated with peace, giving, warmth, and togetherness.', '25 Dec 2026', '2026-12-25', true, 350)
on conflict (code) where workspace_id is null do update
set
  name = excluded.name,
  category = excluded.category,
  community = excluded.community,
  regions_json = excluded.regions_json,
  meaning = excluded.meaning,
  date_label = excluded.date_label,
  next_occurs_on = excluded.next_occurs_on,
  active = excluded.active,
  sort_order = excluded.sort_order;
