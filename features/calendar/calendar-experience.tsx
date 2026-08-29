"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import FullCalendar, {
  type CalendarRef,
  type DateClickInfo,
  type DateSelectInfo,
  type DatesSetInfo,
  type EventClickInfo,
  type EventDisplayInfo,
  type EventDropInfo,
  type EventResizeDoneInfo,
} from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import classicThemePlugin from "@fullcalendar/react/themes/classic";
import {
  CalendarDays,
  CheckSquare2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Home,
  ListFilter,
  LockKeyhole,
  Plus,
  Repeat2,
  Sparkles,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  CalendarEventDialog,
  CalendarSeriesDialog,
  CalendarSourceDetailDialog,
  type CalendarDetailSelection,
  type EventDialogState,
  type PendingSeriesChange,
} from "@/features/calendar/calendar-dialogs";
import { moveCalendarItemAction, resizeCalendarEventAction } from "@/features/calendar/actions";
import {
  CALENDAR_SOURCE_PRESENTATION,
  calendarItemsToEventInputs,
  calendarSelectionToDraft,
  type CalendarUiEventExtendedProps,
} from "@/lib/calendar-ui";
import {
  addDaysToDateKey,
  calendarDateKey,
  DEFAULT_CALENDAR_TIME_ZONE,
} from "@/lib/calendar-recurrence";
import type { MoveCalendarItemInput, ResizeCalendarEventInput } from "@/lib/calendar-interactions";
import { cn } from "@/lib/utils";
import type {
  Bill,
  CalendarEvent,
  CalendarItem,
  CalendarSourceType,
  Chore,
  Task,
} from "@/types/domain";

export type CalendarView = "month" | "week" | "day";

const viewNames: Record<CalendarView, string> = {
  month: "dayGridMonth",
  week: "timeGridWeek",
  day: "timeGridDay",
};

const sourceIcons = {
  event: CalendarDays,
  task: CheckSquare2,
  bill: CircleDollarSign,
  chore: Home,
} satisfies Record<CalendarSourceType, typeof CalendarDays>;

function friendlyView(viewType: string): CalendarView {
  if (viewType === "dayGridMonth") return "month";
  if (viewType === "timeGridDay") return "day";
  return "week";
}

function isRecurring(props: CalendarUiEventExtendedProps) {
  return props.recurrence !== "none";
}

function mutationErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The calendar could not reach the server.";
}

function EventCard({ info }: { info: EventDisplayInfo }) {
  const props = info.event.extendedProps as CalendarUiEventExtendedProps;
  const Icon = sourceIcons[props.sourceType];
  const compact = info.isShort || info.isNarrow;

  return (
    <div className={cn("tracked-calendar-event-content", compact && "is-compact")}>
      <div className="tracked-calendar-event-main">
        <Icon className="tracked-calendar-event-icon" aria-hidden="true" />
        <span className="tracked-calendar-event-title">{info.event.title}</span>
        {isRecurring(props) ? <Repeat2 className="tracked-calendar-event-status" aria-label="Recurring" /> : null}
        {!props.canMove ? <LockKeyhole className="tracked-calendar-event-status" aria-label="Read-only occurrence" /> : null}
      </div>
      {!info.event.allDay && info.timeText ? <span className="tracked-calendar-event-time">{info.timeText}</span> : null}
      {!compact && props.detail ? <span className="tracked-calendar-event-detail">{props.detail}</span> : null}
      {props.canResize ? <span className="tracked-calendar-resize-cue" aria-hidden="true" /> : null}
    </div>
  );
}

export function CalendarExperience({
  initialDate,
  initialView,
  items,
  events,
  tasks,
  bills,
  chores,
  timeZone = DEFAULT_CALENDAR_TIME_ZONE,
}: {
  initialDate: string;
  initialView: CalendarView;
  items: CalendarItem[];
  events: CalendarEvent[];
  tasks: Task[];
  bills: Bill[];
  chores: Chore[];
  timeZone?: string;
}) {
  const calendarRef = useRef<CalendarRef>(null);
  const didReceiveInitialDates = useRef(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { resolvedTheme } = useTheme();
  const [activeView, setActiveView] = useState<CalendarView>(initialView);
  const [title, setTitle] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [mutationPending, setMutationPending] = useState(false);
  const [seriesPending, setSeriesPending] = useState<PendingSeriesChange | null>(null);
  const [seriesBusy, setSeriesBusy] = useState(false);
  const [eventDialog, setEventDialog] = useState<EventDialogState>(null);
  const [detailSelection, setDetailSelection] = useState<CalendarDetailSelection | null>(null);
  const [visibleSources, setVisibleSources] = useState<Set<CalendarSourceType>>(
    () => new Set(["event", "task", "bill", "chore"]),
  );

  const calendarEvents = useMemo(
    () => calendarItemsToEventInputs(items.filter((item) => visibleSources.has(item.sourceType)), timeZone),
    [items, timeZone, visibleSources],
  );
  const sourceCounts = useMemo(() => {
    const counts: Record<CalendarSourceType, number> = { event: 0, task: 0, bill: 0, chore: 0 };
    for (const item of items) counts[item.sourceType] += 1;
    return counts;
  }, [items]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const apply = () => {
      setIsMobile(media.matches);
      const api = calendarRef.current?.getApi();
      if (media.matches && api?.view.type === "timeGridWeek") api.changeView("timeGridDay");
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    const hasUrlPreference = searchParams.has("view");
    const saved = window.localStorage.getItem("tracked-calendar-view") as CalendarView | null;
    const validSaved = saved === "month" || saved === "week" || saved === "day" ? saved : null;
    let preferred = hasUrlPreference ? initialView : validSaved ?? initialView;
    if (window.matchMedia("(max-width: 767px)").matches && preferred === "week") preferred = "day";
    if (api.view.type !== viewNames[preferred]) api.changeView(viewNames[preferred]);
  }, [initialView, searchParams]);

  const syncUrl = useCallback((view: CalendarView, date: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", view);
    params.set("date", date);
    params.delete("notice");
    params.delete("error");
    setIsNavigating(true);
    startTransition(() => {
      router.replace(`/calendar?${params.toString()}`, { scroll: false });
      window.setTimeout(() => setIsNavigating(false), 350);
    });
  }, [router, searchParams]);

  const handleDatesSet = useCallback((info: DatesSetInfo) => {
    const view = friendlyView(info.view.type);
    setActiveView(view);
    setTitle(info.view.title);
    window.localStorage.setItem("tracked-calendar-view", view);

    if (!didReceiveInitialDates.current) {
      didReceiveInitialDates.current = true;
      return;
    }

    const date = calendarDateKey(info.view.currentStart, timeZone);
    syncUrl(view, date);
  }, [syncUrl, timeZone]);

  function changeView(view: CalendarView) {
    const nextView = isMobile && view === "week" ? "day" : view;
    window.localStorage.setItem("tracked-calendar-view", nextView);
    calendarRef.current?.getApi().changeView(viewNames[nextView]);
  }

  function navigate(direction: "previous" | "today" | "next") {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    if (direction === "previous") api.prev();
    if (direction === "today") api.today();
    if (direction === "next") api.next();
  }

  function createFromSelection(selection: { start: string | Date; end: string | Date; allDay: boolean }) {
    setDetailSelection(null);
    setEventDialog({ mode: "create", draft: calendarSelectionToDraft(selection, timeZone) });
  }

  function handleDateClick(info: DateClickInfo) {
    if (info.allDay) {
      const date = calendarDateKey(info.dateStr, timeZone);
      createFromSelection({ start: date, end: addDaysToDateKey(date, 1), allDay: true });
      return;
    }
    createFromSelection({
      start: info.dateStr,
      end: new Date(info.date.getTime() + 30 * 60 * 1000),
      allDay: false,
    });
  }

  function handleSelect(info: DateSelectInfo) {
    createFromSelection({ start: info.startStr, end: info.endStr, allDay: info.allDay });
    info.view.calendar.unselect();
  }

  function handleAddEvent() {
    const current = calendarRef.current?.getApi().getDate() ?? new Date();
    const date = calendarDateKey(current, timeZone);
    setEventDialog({
      mode: "create",
      draft: {
        allDay: activeView === "month",
        startDate: date,
        endDate: date,
        startTime: activeView === "month" ? "" : "09:00",
        endTime: activeView === "month" ? "" : "09:30",
      },
    });
  }

  function handleEventClick(info: EventClickInfo) {
    info.jsEvent.preventDefault();
    const props = info.event.extendedProps as CalendarUiEventExtendedProps;
    if (props.sourceType === "event") {
      const master = events.find((event) => event.id === props.sourceId);
      if (!master) {
        toast.error("This event is no longer available. Refresh and try again.");
        return;
      }
      setEventDialog({ mode: "edit", event: master });
      return;
    }

    setDetailSelection({
      title: info.event.title,
      startStr: info.event.startStr,
      endStr: info.event.endStr,
      allDay: info.event.allDay,
      props,
    });
  }

  async function executeMove(input: MoveCalendarItemInput, revert: () => void) {
    setMutationPending(true);
    try {
      const result = await moveCalendarItemAction(input);
      if (!result.ok) {
        revert();
        toast.error("Move could not be saved", { description: result.error });
        return;
      }
      toast.success(input.scope === "series" ? "Series schedule moved" : "Schedule moved");
      router.refresh();
    } catch (error) {
      revert();
      toast.error("Move could not be saved", { description: mutationErrorMessage(error) });
    } finally {
      setMutationPending(false);
    }
  }

  function handleEventDrop(info: EventDropInfo) {
    const props = info.event.extendedProps as CalendarUiEventExtendedProps;
    const input: MoveCalendarItemInput = {
      sourceId: props.sourceId,
      sourceType: props.sourceType,
      originalStartStr: info.oldEvent.startStr,
      originalOccurrenceDate: props.occurrenceDate ?? calendarDateKey(info.oldEvent.startStr, timeZone),
      startStr: info.event.startStr,
      endStr: info.event.endStr || null,
      allDay: info.event.allDay,
    };

    if (isRecurring(props)) {
      setSeriesPending({
        title: `Move “${info.event.title}”?`,
        description: props.sourceType === "event"
          ? "This occurrence belongs to a recurring series. The current schema safely supports moving the entire series."
          : "This is the current due occurrence. Moving it re-anchors the recurring source schedule.",
        confirmLabel: "Move entire series",
        revert: info.revert,
        run: () => executeMove({ ...input, scope: "series" }, info.revert),
      });
      return;
    }

    void executeMove(input, info.revert);
  }

  async function executeResize(input: ResizeCalendarEventInput, revert: () => void) {
    setMutationPending(true);
    try {
      const result = await resizeCalendarEventAction(input);
      if (!result.ok) {
        revert();
        toast.error("Resize could not be saved", { description: result.error });
        return;
      }
      toast.success(input.scope === "series" ? "Series duration updated" : "Duration updated");
      router.refresh();
    } catch (error) {
      revert();
      toast.error("Resize could not be saved", { description: mutationErrorMessage(error) });
    } finally {
      setMutationPending(false);
    }
  }

  function handleEventResize(info: EventResizeDoneInfo) {
    const props = info.event.extendedProps as CalendarUiEventExtendedProps;
    const input: ResizeCalendarEventInput = {
      sourceId: props.sourceId,
      startStr: info.event.startStr,
      endStr: info.event.endStr,
    };
    if (isRecurring(props)) {
      setSeriesPending({
        title: `Resize “${info.event.title}”?`,
        description: "Duration is stored on the recurring master, so this change applies to every occurrence in the series.",
        confirmLabel: "Resize entire series",
        revert: info.revert,
        run: () => executeResize({ ...input, scope: "series" }, info.revert),
      });
      return;
    }
    void executeResize(input, info.revert);
  }

  function cancelSeriesChange() {
    seriesPending?.revert();
    setSeriesPending(null);
  }

  async function confirmSeriesChange() {
    if (!seriesPending) return;
    setSeriesBusy(true);
    try {
      await seriesPending.run();
      setSeriesPending(null);
    } finally {
      setSeriesBusy(false);
    }
  }

  function toggleSource(source: CalendarSourceType) {
    setVisibleSources((current) => {
      const next = new Set(current);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  }

  const colorScheme = resolvedTheme === "light" ? "light" : "dark";

  return (
    <section className="tracked-calendar-shell overflow-hidden rounded-xl border bg-card shadow-xl shadow-black/5">
      <div className={cn("tracked-calendar-progress", (isNavigating || mutationPending) && "is-active")} aria-hidden="true" />
      <header className="border-b bg-card/95 px-3 py-3 sm:px-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center justify-between gap-3 sm:justify-start">
            <div className="flex items-center rounded-lg border bg-background p-0.5">
              <Button variant="ghost" size="icon" className="size-8" onClick={() => navigate("previous")} aria-label={`Previous ${activeView}`}>
                <ChevronLeft className="size-4" />
              </Button>
              <Button variant="ghost" size="sm" className="h-8 px-2.5" onClick={() => navigate("today")}>Today</Button>
              <Button variant="ghost" size="icon" className="size-8" onClick={() => navigate("next")} aria-label={`Next ${activeView}`}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
            <div className="min-w-0">
              <p className="truncate text-lg font-black tracking-tight sm:text-xl">{title || "Your schedule"}</p>
              <p className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                <Clock3 className="size-3" /> {timeZone.replace("_", " ")}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <div className="grid flex-1 grid-cols-3 rounded-lg border bg-background p-0.5 sm:flex-none">
              {(["month", "week", "day"] as CalendarView[]).map((view) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => changeView(view)}
                  aria-pressed={activeView === view}
                  className={cn(
                    "h-8 rounded-md px-3 text-xs font-bold capitalize transition-all",
                    isMobile && view === "week" && "hidden",
                    activeView === view ? "bg-accent text-accent-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {view}
                </button>
              ))}
            </div>
            <Button size="sm" className="h-9 shrink-0" onClick={handleAddEvent}>
              <Plus className="size-4" /> <span className="hidden sm:inline">Add event</span><span className="sm:hidden">Add</span>
            </Button>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="mr-1 flex shrink-0 items-center gap-1.5 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            <ListFilter className="size-3.5" /> Sources
          </span>
          {(Object.keys(CALENDAR_SOURCE_PRESENTATION) as CalendarSourceType[]).map((source) => {
            const presentation = CALENDAR_SOURCE_PRESENTATION[source];
            const Icon = sourceIcons[source];
            const visible = visibleSources.has(source);
            return (
              <button
                key={source}
                type="button"
                aria-pressed={visible}
                onClick={() => toggleSource(source)}
                style={{ "--source-color": presentation.color } as CSSProperties}
                className={cn("tracked-calendar-source-chip", visible && "is-active")}
              >
                <Icon className="size-3.5" />
                {presentation.label}
                <span>{sourceCounts[source]}</span>
              </button>
            );
          })}
          <span className="ml-auto hidden shrink-0 items-center gap-1.5 text-xs text-muted-foreground lg:flex">
            <Sparkles className="size-3.5 text-primary" /> Drag to plan · pull the lower edge to resize
          </span>
        </div>
      </header>

      <div className="tracked-calendar p-2 sm:p-3" data-color-scheme={colorScheme}>
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, classicThemePlugin]}
          initialView={viewNames[initialView]}
          initialDate={initialDate}
          headerToolbar={false}
          events={calendarEvents}
          timeZone={timeZone}
          firstDay={0}
          height={isMobile ? "auto" : 760}
          expandRows={!isMobile}
          allDaySlot
          allDayText="All day"
          nowIndicator
          nowIndicatorSnap="auto"
          selectable
          selectMirror
          selectMinDistance={3}
          selectLongPressDelay={350}
          editable
          eventStartEditable
          eventDurationEditable
          eventResizableFromStart={false}
          allDayMaintainDuration
          dragRevertDuration={280}
          dragScroll
          longPressDelay={350}
          slotDuration="00:30:00"
          snapDuration="00:15:00"
          slotMinTime="00:00:00"
          slotMaxTime="24:00:00"
          scrollTime="07:00:00"
          scrollTimeReset={false}
          slotMinHeight={28}
          eventMinHeight={24}
          eventShortHeight={36}
          dayMaxEvents={activeView === "month" ? 4 : true}
          moreLinkClick="popover"
          displayEventEnd
          eventTimeFormat={{ hour: "numeric", minute: "2-digit" }}
          slotHeaderFormat={{ hour: "numeric", minute: "2-digit" }}
          views={{
            dayGridMonth: { titleFormat: { month: "long", year: "numeric" } },
            timeGridWeek: { titleFormat: { month: "short", day: "numeric", year: "numeric" } },
            timeGridDay: { titleFormat: { weekday: "long", month: "long", day: "numeric" } },
          }}
          dateClick={handleDateClick}
          select={handleSelect}
          datesSet={handleDatesSet}
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          eventResize={handleEventResize}
          eventAllow={(dropInfo, movingEvent) => {
            if (!movingEvent) return true;
            const props = movingEvent.extendedProps as CalendarUiEventExtendedProps;
            return props.canMove && (dropInfo.allDay || props.acceptsTimedDrop);
          }}
          eventContent={(info) => <EventCard info={info} />}
          eventDidMount={(info) => {
            const props = info.event.extendedProps as CalendarUiEventExtendedProps;
            info.el.title = `${CALENDAR_SOURCE_PRESENTATION[props.sourceType].label}: ${info.event.title}${info.timeText ? ` · ${info.timeText}` : ""}${props.detail ? ` · ${props.detail}` : ""}`;
            info.el.dataset.source = props.sourceType;
          }}
          viewDidMount={(info) => info.el.classList.add("tracked-calendar-view")}
          dayCellDidMount={(info) => info.el.classList.add("tracked-calendar-day")}
          dayLaneDidMount={(info) => info.el.classList.add("tracked-calendar-day-lane")}
          dayHeaderDidMount={(info) => info.el.classList.add("tracked-calendar-day-header")}
          slotLaneDidMount={(info) => info.el.classList.add("tracked-calendar-slot")}
          allDayHeaderDidMount={(info) => info.el.classList.add("tracked-calendar-all-day-label")}
          nowIndicatorLineDidMount={(info) => info.el.classList.add("tracked-calendar-now-line")}
          noEventsContent={() => (
            <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
              <CalendarDays className="size-7 opacity-50" />
              <p className="text-sm font-semibold text-foreground">Nothing scheduled here</p>
              <p className="text-xs">Click or drag on the calendar to make time.</p>
            </div>
          )}
        />
      </div>

      {eventDialog ? (
        <CalendarEventDialog
          key={eventDialog.mode === "edit" ? eventDialog.event.id : `${eventDialog.draft.startDate}-${eventDialog.draft.startTime}`}
          state={eventDialog}
          timeZone={timeZone}
          onOpenChange={(open) => { if (!open) setEventDialog(null); }}
        />
      ) : null}
      <CalendarSourceDetailDialog
        selection={detailSelection}
        tasks={tasks}
        bills={bills}
        chores={chores}
        timeZone={timeZone}
        onOpenChange={(open) => { if (!open) setDetailSelection(null); }}
      />
      <CalendarSeriesDialog
        pending={seriesPending}
        busy={seriesBusy}
        onCancel={cancelSeriesChange}
        onConfirm={() => void confirmSeriesChange()}
      />
    </section>
  );
}
