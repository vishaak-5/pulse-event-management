package com.eventsystem.repository;

import com.eventsystem.model.Feedback;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface FeedbackRepository extends JpaRepository<Feedback, Long> {

    Optional<Feedback> findByEventIdAndUserId(Long eventId, Long userId);

    @Query("select f from Feedback f join fetch f.user where f.event.id = :eventId order by f.createdAt desc")
    List<Feedback> findByEvent(@Param("eventId") Long eventId);

    @Query("select avg(f.rating) from Feedback f where f.event.id = :eventId")
    Double averageRating(@Param("eventId") Long eventId);

    long countByEventId(Long eventId);

    @Query("select f from Feedback f join fetch f.event where f.user.id = :userId")
    List<Feedback> findByUser(@Param("userId") Long userId);
}
