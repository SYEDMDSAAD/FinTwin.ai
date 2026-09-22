package com.fintwin.service;

import com.fintwin.exception.BadRequestException;
import com.fintwin.model.IpoListing;
import com.fintwin.repository.IpoListingRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class IpoServiceTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 9, 22);

    @Mock private IpoListingRepository repo;
    @Mock private DiscoverService discover;

    private IpoService service() {
        return new IpoService(repo, discover,
                Clock.fixed(TODAY.atStartOfDay(ZoneId.of("Asia/Kolkata")).toInstant(), ZoneId.of("Asia/Kolkata")));
    }

    private static IpoListing ipo(long id, String name, String open, String close, String listing) {
        IpoListing i = new IpoListing();
        ReflectionTestUtils.setField(i, "id", id);
        i.setName(name);
        if (open != null) i.setOpenDate(LocalDate.parse(open));
        if (close != null) i.setCloseDate(LocalDate.parse(close));
        if (listing != null) i.setListingDate(LocalDate.parse(listing));
        return i;
    }

    @Test
    void statusFollowsTheDates() {
        assertThat(IpoService.statusOf(ipo(1, "a", "2026-09-25", "2026-09-29", null), TODAY)).isEqualTo(IpoService.Status.UPCOMING);
        assertThat(IpoService.statusOf(ipo(1, "a", "2026-09-22", "2026-09-24", null), TODAY)).isEqualTo(IpoService.Status.OPEN);
        assertThat(IpoService.statusOf(ipo(1, "a", "2026-09-15", "2026-09-17", "2026-09-23"), TODAY)).isEqualTo(IpoService.Status.CLOSED);
        assertThat(IpoService.statusOf(ipo(1, "a", "2026-09-10", "2026-09-12", "2026-09-22"), TODAY)).isEqualTo(IpoService.Status.LISTED);
        assertThat(IpoService.statusOf(ipo(1, "a", null, null, null), TODAY)).isEqualTo(IpoService.Status.UPCOMING);
    }

    @Test
    void usersSeeOpenFirstThenUpcomingSoonestThenClosedThenRecentlyListed() {
        IpoListing listedOld = ipo(1, "Listed long ago", "2026-05-01", "2026-05-03", "2026-05-08");   // > 90 days
        IpoListing listed = ipo(2, "Listed", "2026-09-01", "2026-09-03", "2026-09-08");
        IpoListing upcomingLate = ipo(3, "Upcoming later", "2026-10-10", "2026-10-14", null);
        IpoListing upcomingSoon = ipo(4, "Upcoming soon", "2026-09-26", "2026-09-30", null);
        IpoListing open = ipo(5, "Open", "2026-09-21", "2026-09-23", null);
        IpoListing closed = ipo(6, "Closed", "2026-09-15", "2026-09-17", "2026-09-24");
        when(repo.findAll()).thenReturn(List.of(listedOld, listed, upcomingLate, upcomingSoon, open, closed));

        List<Map<String, Object>> rows = service().forUsers();

        assertThat(rows).extracting(m -> m.get("name"))
                .containsExactly("Open", "Upcoming soon", "Upcoming later", "Closed", "Listed");
        verify(discover, never()).quotes(any());   // nothing listed has a symbol yet
    }

    @Test
    void aListedIpoShowsItsLivePriceAgainstTheIssuePrice() {
        IpoListing listed = ipo(2, "NewCo", "2026-09-01", "2026-09-03", "2026-09-08");
        listed.setSymbol("NEWCO");
        listed.setIssuePrice(new BigDecimal("100"));
        listed.setLotSize(148);
        when(repo.findAll()).thenReturn(List.of(listed));
        when(discover.quotes(List.of("NEWCO"))).thenReturn(List.of(Map.of("symbol", "NEWCO.NS", "price", 131.5)));

        Map<String, Object> row = service().forUsers().get(0);

        assertThat(row).containsEntry("currentPrice", 131.5).containsEntry("gainPct", 31.5);
        assertThat(row.get("minInvestment")).isEqualTo(new BigDecimal("14800"));
    }

    @Test
    void theCatalogStillLoadsWhenLivePricesAreDown() {
        IpoListing listed = ipo(2, "NewCo", "2026-09-01", "2026-09-03", "2026-09-08");
        listed.setSymbol("NEWCO");
        when(repo.findAll()).thenReturn(List.of(listed));
        when(discover.quotes(any())).thenThrow(new RuntimeException("market data down"));

        assertThat(service().forUsers()).hasSize(1).first().satisfies(m -> assertThat(m).doesNotContainKey("currentPrice"));
    }

    @Test
    void minimumInvestmentUsesTheTopOfTheBandBeforeTheFinalPrice() {
        IpoListing i = ipo(1, "a", "2026-09-25", null, null);
        i.setPriceBandLow(new BigDecimal("95"));
        i.setPriceBandHigh(new BigDecimal("100"));
        i.setLotSize(150);
        assertThat(IpoService.view(i).get("minInvestment")).isEqualTo(new BigDecimal("15000"));
    }

    @Test
    void adminInputIsValidated() {
        IpoListing noName = ipo(1, " ", null, null, null);
        assertThatThrownBy(() -> IpoService.validate(noName)).isInstanceOf(BadRequestException.class);

        IpoListing band = ipo(1, "a", null, null, null);
        band.setPriceBandLow(new BigDecimal("110"));
        band.setPriceBandHigh(new BigDecimal("100"));
        assertThatThrownBy(() -> IpoService.validate(band)).hasMessageContaining("band");

        IpoListing dates = ipo(1, "a", "2026-09-25", "2026-09-20", null);
        assertThatThrownBy(() -> IpoService.validate(dates)).hasMessageContaining("close date");

        IpoListing lot = ipo(1, "a", null, null, null);
        lot.setLotSize(0);
        assertThatThrownBy(() -> IpoService.validate(lot)).hasMessageContaining("Lot size");
    }

    @Test
    void adminSaveNormalisesTheSymbol() {
        IpoListing in = ipo(0, "  NewCo Ltd ", "2026-09-25", "2026-09-29", null);
        in.setSymbol(" newco.ns ");
        in.setCategory("sme");
        when(repo.save(any(IpoListing.class))).thenAnswer(inv -> inv.getArgument(0));

        Map<String, Object> saved = service().save(null, in);

        assertThat(saved).containsEntry("name", "NewCo Ltd").containsEntry("symbol", "NEWCO")
                .containsEntry("category", "SME").containsEntry("status", "UPCOMING");
    }
}
