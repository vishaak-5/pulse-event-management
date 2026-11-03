package com.eventsystem.repository;

import com.eventsystem.model.Category;
import com.eventsystem.model.Event;
import com.eventsystem.model.EventStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface EventRepository extends JpaRepository<Event, Long> {

    /** Row lock so concurrent registrations cannot oversell the last seats. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select e from Event e where e.id = :id")
    Optional<Event> findByIdForUpdate(@Param("id") Long id);

    @Query("""
            select e from Event e join fetch e.organizer
            where e.status = com.eventsystem.model.EventStatus.APPROVED
              and (:includePast = true or e.endAt > :now)
              and (:category is null or e.category = :category)
              and (:q is null or lower(e.title) like lower(concat('%', :q, '%'))
                              or lower(e.venue) like lower(concat('%', :q, '%')))
            order by e.startAt asc
            """)
    List<Event> searchPublic(@Param("q") String q,
                             @Param("category") Category category,
                             @Param("includePast") boolean includePast,
                             @Param("now") LocalDateTime now);

    @Query("select e from Event e join fetch e.organizer where e.organizer.id = :organizerId order by e.startAt desc")
    List<Event> findByOrganizer(@Param("organizerId") Long organizerId);

    @Query("select e from Event e join fetch e.organizer where (:status is null or e.status = :status) order by e.createdAt desc")
    List<Event> findForAdmin(@Param("status") EventStatus status);

    long countByStatus(EventStatus status);

    @Query("""
            select e from Event e
            where e.status = com.eventsystem.model.EventStatus.APPROVED
              and e.reminderSent = false
              and e.startAt between :from and :to
            """)
    List<Event> findNeedingReminder(@Param("from") LocalDateTime from, @Param("to") LocalDateTime to);
}
