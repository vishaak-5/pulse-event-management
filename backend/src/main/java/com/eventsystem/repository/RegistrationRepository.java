package com.eventsystem.repository;

import com.eventsystem.model.Registration;
import com.eventsystem.model.RegistrationStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface RegistrationRepository extends JpaRepository<Registration, Long> {

    Optional<Registration> findByEventIdAndUserId(Long eventId, Long userId);

    @Query("select r from Registration r join fetch r.event e join fetch e.organizer join fetch r.user where r.certificateCode = :code")
    Optional<Registration> findByCertificateCode(@Param("code") String code);

    @Query("select r from Registration r join fetch r.event e join fetch e.organizer join fetch r.user where r.id = :id")
    Optional<Registration> findFullById(@Param("id") Long id);

    long countByEventIdAndCreatedAtAfter(Long eventId, LocalDateTime after);

    @Query("select r from Registration r join fetch r.event e join fetch e.organizer join fetch r.user where r.ticketCode = :code")
    Optional<Registration> findByTicketCode(@Param("code") String code);

    long countByEventIdAndStatusIn(Long eventId, Collection<RegistrationStatus> statuses);

    long countByEventIdAndStatus(Long eventId, RegistrationStatus status);

    long countByStatusIn(Collection<RegistrationStatus> statuses);

    @Query("select r from Registration r join fetch r.event e join fetch e.organizer where r.user.id = :userId order by e.startAt desc")
    List<Registration> findByUser(@Param("userId") Long userId);

    @Query("select r from Registration r join fetch r.user where r.event.id = :eventId order by r.queuedAt asc")
    List<Registration> findByEvent(@Param("eventId") Long eventId);

    /** Waitlist head first. */
    @Query("""
            select r from Registration r join fetch r.user
            where r.event.id = :eventId and r.status = com.eventsystem.model.RegistrationStatus.WAITLISTED
            order by r.queuedAt asc, r.id asc
            """)
    List<Registration> findWaitlist(@Param("eventId") Long eventId);

    @Query("""
            select count(r) from Registration r
            where r.event.id = :eventId and r.status = com.eventsystem.model.RegistrationStatus.WAITLISTED
              and r.id <> :id
              and (r.queuedAt < :queuedAt or (r.queuedAt = :queuedAt and r.id < :id))
            """)
    long countAheadInWaitlist(@Param("eventId") Long eventId,
                              @Param("queuedAt") LocalDateTime queuedAt,
                              @Param("id") Long id);

    @Query("""
            select r from Registration r join fetch r.user
            where r.event.id = :eventId
              and r.status in (com.eventsystem.model.RegistrationStatus.CONFIRMED,
                               com.eventsystem.model.RegistrationStatus.CHECKED_IN)
            """)
    List<Registration> findSeatHolders(@Param("eventId") Long eventId);

    /**
     * Per user: [userId, seats held at events that have already ended, how many of those they checked in to].
     * The event being forecast is excluded.
     */
    @Query("""
            select r.user.id, count(r),
                   sum(case when r.status = com.eventsystem.model.RegistrationStatus.CHECKED_IN then 1 else 0 end)
            from Registration r
            where r.user.id in :userIds and r.event.id <> :eventId and r.event.endAt < :now
              and r.event.status = com.eventsystem.model.EventStatus.APPROVED
              and r.status in (com.eventsystem.model.RegistrationStatus.CONFIRMED,
                               com.eventsystem.model.RegistrationStatus.CHECKED_IN)
            group by r.user.id
            """)
    List<Object[]> attendanceHistory(@Param("userIds") Collection<Long> userIds,
                                     @Param("eventId") Long eventId,
                                     @Param("now") LocalDateTime now);

    /** Every non-cancelled registration of a user, with its event - input for recommendations. */
    @Query("""
            select r from Registration r join fetch r.event
            where r.user.id = :userId and r.status <> com.eventsystem.model.RegistrationStatus.CANCELLED
            """)
    List<Registration> findActiveByUser(@Param("userId") Long userId);

    @Query("""
            select r from Registration r join fetch r.user
            where r.event.id = :eventId and r.status = com.eventsystem.model.RegistrationStatus.CHECKED_IN
            order by r.checkedInAt desc
            """)
    List<Registration> findRecentCheckIns(@Param("eventId") Long eventId);
}
