const WEEK = 'WEEK';
const MONTH = 'MONTH';

class MonthYear {
  constructor(value) {
    this.month = this.parse_month(value.split(' ')[0]);
    this.year = this.parse_year(value.split(' ')[1]);
  }

  valueOf() {
    return this.year * 10000 + this.month;
  }

  parse_month(value) {
    switch(value.toLowerCase()) {
      case "january":
      case "jan":
        return 1;
      case "february":
      case "feb":
        return 2;
      case "march":
      case "mar":
        return 3;
      case "april":
      case "apr":
        return 4;
      case "may":
        return 5;
      case "june":
      case "jun":
        return 6;
      case "july":
      case "jul":
        return 7;
      case "august":
      case "aug":
        return 8;
      case "september":
      case "sep":
        return 9;
      case "october":
      case "oct":
        return 10;
      case "november":
      case "nov":
        return 11;
      case "december":
      case "dec":
        return 12;
    }
    return 0;
  }

  parse_year(value) {
    return parseInt(value, 0);
  }
}

class Comparer {
  static get_comparer(parent) {
    if (!parent) {
      return Comparer.natural;
    }
    switch(parent.ChildSortingStyle) {
      case 'Alphanumeric':
        return Comparer.alphanumeric;
      case 'ReverseAlphanumeric':
        return Comparer.reverse_alphanumeric;
      case 'DateDescending':
        return Comparer.date_descending;
      case 'DateAscending':
        return Comparer.date_ascending;
      case 'Custom':
        return Comparer.by_rank;
    }
    return Comparer.natural;
  }

  static alphanumeric(venue1, venue2) {
    var name1 = venue1.Name.trim().toLowerCase();
    var name2 = venue2.Name.trim().toLowerCase();
    if (name1 > name2) {
      return 1;
    }
    else if (name1 === name2) {
      return 0;
    }
    return -1;
  }

  static reverse_alphanumeric(venue1, venue2) {
    return Comparer.alphanumeric(venue2, venue1);
  }

  static natural(venue1, venue2) {
    var id1 = venue1.VenueId;
    var id2 = venue2.VenueId;
    if (id1 > id2) {
      return 1;
    }
    else if (id1 === id2) {
      return 0;
    }
    return -1;
  }

  static date_descending(venue1, venue2) {
    return Comparer.date_ascending(venue2, venue1);
  }

  static date_ascending(venue1, venue2) {
    var type1 = Comparer.get_date_type(venue1);
    var type2 = Comparer.get_date_type(venue2);
    if (type1 !== type2) {
      return alphanumeric(venue1, venue2)
    }
    switch(type1) {
      case WEEK:
        return Comparer.by_week(venue1, venue2);
      case MONTH:
        return Comparer.by_month(venue1, venue2);
    }
    return Comparer.alphanumeric(venue1, venue2);
  }

  static get_date_type(venue) {
    var date = Date.parse(venue.Name.split(' ')[0]);
    if (date) {
      return WEEK;
    }
    else {
      return MONTH;
    }
  }

  static by_week(venue1, venue2) {
    var date1 = Date.parse(venue1.Name.split(' ')[0]);
    var date2 = Date.parse(venue2.Name.split(' ')[0]);
    if (date1 > date2) {
      return 1;
    }
    else if (date1 === date2) {
      return 0;
    }
    return -1;
  }

  static by_month(venue1, venue2) {
    var month1 = new MonthYear(venue1.Name);
    var month2 = new MonthYear(venue2.Name);
    if (month1 > month2) {
      return 1;
    }
    else if (month1 === month2) {
      return 0;
    }
    return -1;
  }

  static by_rank(venue1, venue2) {
    if (venue1.SortingRank > venue2.SortingRank) {
      return 1;
    }
    else if (venue1.SortingRank === venue2.SortingRank) {
      return 0;
    }
    return -1;
  }
}
